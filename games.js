window.ALI_HAMZA_GAMES = GAMES.filter(function(game){return game.category !== 'demo';}).map(function(game, i) {
  return {id:game.id, name:game.name, hint:'GAME '+String(i+1).padStart(2,'0')+' · DRIVE INTO BOX',
    tag:'Game '+(i+1), x:(i%4)*28-42, z:32-Math.floor(i/4)*24, r:8, dir:[0,-1], game:game};
});
(function(){
  var dialog=document.getElementById('gameDialog');
  var media=document.getElementById('gameMedia');
  var previousFocus;
  window.gamePanelOpen=false;
  function renderMedia(game) {
    media.replaceChildren();
    (game.videos || []).forEach(function(url){
      var figure=document.createElement('figure');
      var video=document.createElement('video');
      video.controls=true;video.preload='metadata';video.playsInline=true;video.src=url;
      video.addEventListener('error',function(){figure.remove();});
      figure.appendChild(video);media.appendChild(figure);
    });
    (game.screenshots || []).forEach(function(url,i){
      var figure=document.createElement('figure');
      var img=document.createElement('img');img.alt=game.name+' — screenshot '+(i+1);img.src=url;
      img.addEventListener('error',function(){figure.remove();});
      figure.appendChild(img);media.appendChild(figure);
    });
    (game.videoLinks || []).filter(function(item){return item.url !== game.url;}).forEach(function(item){
      var p=document.createElement('p'),a=document.createElement('a');
      a.href=item.url;a.textContent=item.label;a.target='_blank';a.rel='noopener noreferrer';
      p.appendChild(a);media.appendChild(p);
    });
  }
  var activeGameId=null;
  window.showGame=function(game){
    if(window.gamePanelOpen) return;
    previousFocus=document.activeElement;
    window.gamePanelOpen=true;
    document.getElementById('gameTitle').textContent=game.name;
    var link=document.getElementById('gameLink');
    link.href=game.url;
    link.textContent=game.url.includes('play.google.com') ? 'View on Google Play ↗' : game.url.includes('linkedin.com') ? 'Watch on LinkedIn ↗' : game.url.includes('meta.com') ? 'View on Meta ↗' : game.category==='demo' ? 'Open video collection ↗' : 'View project ↗';
    activeGameId=game.id;
    renderMedia(game);
    // The local server rescans folders; published sites use the generated manifest.
    if (location.protocol !== 'file:') fetch('media-manifest.json',{cache:'no-store'})
      .then(function(response){if(!response.ok)throw new Error('Media unavailable');return response.json();})
      .then(function(games){
        var fresh=games.find(function(item){return item.id===game.id;});
        if(fresh && window.gamePanelOpen && activeGameId===game.id) renderMedia(fresh);
      }).catch(function(){ /* The bundled media remains available offline. */ });
    dialog.showModal();dialog.scrollTop=0;
  };
  document.getElementById('closeGame').addEventListener('click',function(){dialog.close();});
  dialog.addEventListener('close',function(){
    media.querySelectorAll('video').forEach(function(video){video.pause();});
    media.replaceChildren();activeGameId=null;window.gamePanelOpen=false;
    if(previousFocus && previousFocus.isConnected) previousFocus.focus();
  });
  var directory=document.getElementById('gameDirectory');
  ['game','demo'].forEach(function(category){
    var heading=document.createElement('h3');heading.textContent=category==='demo'?'Older demos':'Games';directory.appendChild(heading);
    GAMES.filter(function(game){return game.category===category;}).forEach(function(game,i){
    var button=document.createElement('button');button.type='button';
    button.textContent=String(i+1).padStart(2,'0')+' / '+game.name;
    button.addEventListener('click',function(){window.showGame(game);});
    directory.appendChild(button);
    });
  });
})();
