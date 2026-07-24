use crate::models::{SearchResult, Song};
use serde_json::Value;

fn get_json(url: &str) -> Result<Value, String> {
    reqwest::blocking::Client::builder().user_agent("EclipsePhonePlayerLite/1.0").build().map_err(|e|e.to_string())?
        .get(url).send().map_err(|e|format!("Could not contact YouTube: {e}"))?
        .error_for_status().map_err(|e|format!("YouTube returned an error: {e}"))?
        .json().map_err(|e|format!("Could not read YouTube's response: {e}"))
}

fn video_id(value:&str)->Option<String>{
    let url=reqwest::Url::parse(value).ok()?;let host=url.host_str()?;
    if host.contains("youtu.be"){return url.path_segments()?.next().filter(|x|!x.is_empty()).map(str::to_string);}
    if host.contains("youtube.com"){
        if let Some(id)=url.query_pairs().find(|(k,_)|k=="v").map(|(_,v)|v.into_owned()){return Some(id);}
        let p:Vec<_>=url.path_segments()?.collect();if matches!(p.first(),Some(&"shorts")|Some(&"embed")){return p.get(1).map(|x|x.to_string());}
    }None
}

fn format_duration(total:u64)->String{
    let hours=total/3600;
    let minutes=(total%3600)/60;
    let seconds=total%60;
    if hours>0{format!("{hours}:{minutes:02}:{seconds:02}")}else{format!("{minutes}:{seconds:02}")}
}

fn watch_duration(id:&str)->Option<String>{
    let url=format!("https://www.youtube.com/watch?v={id}");
    let html=reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36")
        .build().ok()?
        .get(url)
        .header("Accept-Language","en-US,en;q=0.9")
        .send().ok()?
        .error_for_status().ok()?
        .text().ok()?;
    for marker in ["\"lengthSeconds\":\"","\\\"lengthSeconds\\\":\\\""]{
        if let Some(start)=html.find(marker){
            let digits:String=html[start+marker.len()..].chars().take_while(|c|c.is_ascii_digit()).collect();
            if let Ok(seconds)=digits.parse::<u64>(){return Some(format_duration(seconds));}
        }
    }
    None
}

fn text_at(value:&Value,path:&str)->Option<String>{
    let node=value.pointer(path)?;
    node.get("simpleText").and_then(Value::as_str).map(str::to_string).or_else(||{
        let text:String=node.get("runs")?.as_array()?.iter().filter_map(|r|r.get("text")?.as_str()).collect();
        if text.is_empty(){None}else{Some(text)}
    })
}

fn initial_data(html:&str)->Option<Value>{
    let markers=["var ytInitialData = ","ytInitialData = ","window[\"ytInitialData\"] = "];
    for marker in markers { if let Some(start)=html.find(marker){let rest=&html[start+marker.len()..];let brace=rest.find('{')?;let bytes=rest[brace..].as_bytes();let(mut depth,mut string,mut escape)=(0i32,false,false);for(i,&b)in bytes.iter().enumerate(){if string{if escape{escape=false;}else if b==b'\\'{escape=true;}else if b==b'"'{string=false;}continue;}if b==b'"'{string=true;}else if b==b'{'{depth+=1;}else if b==b'}'{depth-=1;if depth==0{return serde_json::from_slice(&bytes[..=i]).ok();}}}}}None
}

fn collect_videos(value:&Value,out:&mut Vec<SearchResult>){
    if let Some(renderer)=value.get("videoRenderer").or_else(||value.get("compactVideoRenderer")){
        if let Some(id)=renderer.get("videoId").and_then(Value::as_str).filter(|id|id.len()==11){
            if !out.iter().any(|r|r.url.ends_with(id)){
                let title=text_at(renderer,"/title").unwrap_or_else(||"Untitled".into());
                let channel=text_at(renderer,"/ownerText").or_else(||text_at(renderer,"/longBylineText")).unwrap_or_else(||"Unknown artist".into());
                let length=text_at(renderer,"/lengthText").unwrap_or_else(||"—".into());
                let thumbnail=renderer.pointer("/thumbnail/thumbnails").and_then(Value::as_array).and_then(|a|a.last()).and_then(|x|x.get("url")).and_then(Value::as_str).map(|x|x.replace("\\u0026","&")).or_else(||Some(format!("https://i.ytimg.com/vi/{id}/mqdefault.jpg")));
                out.push(SearchResult{title,channel,length,url:format!("https://www.youtube.com/watch?v={id}"),thumbnail});
            }
        }
    }
    match value{Value::Array(a)=>for x in a{collect_videos(x,out);},Value::Object(o)=>for x in o.values(){collect_videos(x,out);},_=>{}}
}

pub fn search(query:&str)->Result<Vec<SearchResult>,String>{
    let mut url=reqwest::Url::parse("https://www.youtube.com/results").unwrap();url.query_pairs_mut().append_pair("search_query",query);
    let html=reqwest::blocking::Client::builder().user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36").build().map_err(|e|e.to_string())?.get(url).header("Accept-Language","en-US,en;q=0.9").send().map_err(|e|format!("Could not contact YouTube: {e}"))?.error_for_status().map_err(|e|format!("YouTube returned an error: {e}"))?.text().map_err(|e|format!("Could not read YouTube's search page: {e}"))?;
    let data=initial_data(&html).ok_or("YouTube changed or blocked its search page. Use Open on YouTube and paste the video's URL.")?;let mut results=Vec::new();collect_videos(&data,&mut results);results.truncate(15);
    if results.is_empty(){Err("No video results were found. Try Open on YouTube instead.".into())}else{Ok(results)}
}

pub fn metadata(url:&str)->Result<SearchResult,String>{
    let id=video_id(url).ok_or("Lite can automatically identify YouTube URLs. Other URLs can be completed through Edit Song.")?;
    let endpoint=format!("https://www.youtube.com/oembed?url={}&format=json",urlencoding::encode(url));let d=get_json(&endpoint)?;
    let length=watch_duration(&id).unwrap_or_else(||"—".into());
    Ok(SearchResult{title:d["title"].as_str().unwrap_or("Untitled").into(),channel:d["author_name"].as_str().unwrap_or("Unknown artist").into(),length,url:format!("https://www.youtube.com/watch?v={id}"),thumbnail:d["thumbnail_url"].as_str().map(str::to_string).or_else(||Some(format!("https://i.ytimg.com/vi/{id}/mqdefault.jpg")))})
}

pub fn enrich_legacy_songs(songs:&mut[Song]){let now=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()as i64;for song in songs{if song.added_at.is_none(){song.added_at=Some(now);}if song.artwork.is_none(){if let Some(id)=video_id(&song.url){song.artwork=Some(format!("https://i.ytimg.com/vi/{id}/mqdefault.jpg"));}}}}
