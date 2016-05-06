$(document).ready(function(){
	
	var socket = io();

	// code for play interface
	if ($("#main.play").length === 1) {

		// tell server we are a player
		socket.on('connect', function(){
			socket.emit('player', true);
		});

		// send player id
		socket.on('player-getid', function(){
			socket.emit('player-setid', parseInt($('#main').attr("data-playerid"),10));
		});

		// request player name
		socket.on('player-getname', function(){
			$("#playername-form").submit(function(){
				$("#main.play").removeClass('name').addClass('spin');
				socket.emit('player-setname', $('#playername').val());
				return false;
			});
			$("#main.play").removeClass('spin').addClass('name');
		});

		// game resume
		socket.on("game-resume", function(data){
			socket.emit("player-request", data.article);
			$('#destination').text(data.destination);
			$("#main.play").removeClass('spin').addClass('active');
		});

		// game start
		socket.on("violation", function(v){
			// remove spinner
			alert("Illegaler Link: "+v);
		});

		
		// game start
		socket.on("start", function(){
			// remove spinner
			$("#main.play").removeClass('spin').addClass('active');
		});
		
		// player finish
		socket.on("finish", function(){
			$("#main.play").removeClass('active').addClass('finish');
		});
		
		// game end
		socket.on("end", function(result){
			var playerid = parseInt($('#main').attr("data-playerid"),10);
			if (result.players[playerid].winner) {
				$("#finish").html(result.players[playerid].points+" Punkte<br />Du hast gewonnen!");
			} else {
				$("#finish").html(result.players[playerid].points+" Punkte<br />Danke fürs mitspielen!");
			}
			$("#main.play").removeClass('active').addClass('finish');
		});

		// retrieve article
		socket.on("player-response", function(article){
			var $article = $('<div></div>').html(article.html);
			$('a', $article).each(function(idx, a){
				var $a = $(a);
				if (/^\/wiki\/([^#]+)(#.*)?$/.test($a.attr("href"))) {
					$a.click(function(evt){
						evt.preventDefault();
						$('#article-headline').text($a.attr('title'));
						socket.emit('player-request', $a.attr('title'));
					});
				} else {
					$a.click(function(evt){
						alert("Das ist keine Wikipedia-Link");
						evt.preventDefault();
						return false;
					});
				};
			});
			$('#article-headline').text(article.title);
			$('#article-content').html($article);
			$('#article').scrollTop(0);
		});
		
		// set pair
		socket.on("player-pair", function(pair){
			// load first destination
			socket.emit("player-request", pair[0]);
		});
		
		// set pair
		socket.on("gamedata", function(data){
			$('#timer').text(data.time);
			//FIXME: adjust timer?
			if (data.to !== null) $('#destination').text(data.to);
		});

	};
		
	// code for admin interface
	if ($("#main.admin").length === 1) {
		
		// tell server we are admin
		socket.on('connect', function(){
			socket.emit('admin', true);
		});

		// main control buttons
		$('#round-new').click(function(evt){ socket.emit('round-new', true); });
		$('#round-start').click(function(evt){ socket.emit('round-start', true); });
		$('#round-pause').click(function(evt){ socket.emit('round-pause', true); });
		$('#round-resume').click(function(evt){ socket.emit('round-resume', true); });
		$('#reset').click(function(evt){ socket.emit('admin-reset', true); });
		$('#dings').click(function(evt){ socket.emit('dings', true); });

		// receive gamedata
		socket.on('gamedata', function(data){
//			$('#log').prepend('<p>received gamedata: <pre>'+JSON.stringify(data)+'</pre></p>');
			// playernames
			if (data.player1 !== null) $('.name', '#p0').text(data.player1);
			if (data.player2 !== null) $('.name', '#p1').text(data.player2);
			// set time
			$('#timer').text(data.time);
			// destinations
			if (data.from !== null) $('#from').text(data.from);
			if (data.to !== null) $('#to').text(data.to);
			// status
			$('#status').text((data.ready)?"ready":"waiting");
		});
		
		// show log entry
		socket.on('log', function(data){
			$('#log').prepend('<p>'+data+'</p>');
		});
		
	};

	// code for screen
	if ($("#main.index").length === 1) {

		// tell server we are a display
		socket.on('connect', function(){
			socket.emit('display', true);
		});
		
		setTimeout(function(){
			$("#main").addClass("ready");
		},10000);
		
		// ready handler
		socket.on('ready', function(){
			$('#status').text("Ready!");
			signal.special.play();
			setTimeout(function(){
				$('#status').text("").fadeOut();
			},3000);
		});
		
		// pause-handler
		socket.on('pause', function(){
			$('#status').text("Pause").fadeIn();
		});
		socket.on('resume', function(){
			$('#status').text("").fadeOut();
		});
		
		socket.on('player-stat', function(data){
			var $stat = $('<li>'+data.article+'</li>');
			signal.article.play();
			data.bonus.forEach(function(b){
				if (b[0] > 0) {
					$stat.append(' <span class="badge bonus">+'+b[0]+' '+b[1]+'</span>');
					signal.bonus.play();
				}
				if (b[0] < 0) {
					signal.malus.play();
					$stat.append(' <span class="badge malus">'+b[0]+' '+b[1]+'</span>');
				}
			});
			$('ul', '#p'+data.player).append($stat);
		});
		
		// player finish
		socket.on("player-finish", function(data){
			signal.special.play();
			$('ul', '#p'+data.player).append('<li><span class="badge special"><i class="fa fa-check"></i> Yay!</span></li>');
		});
		
		// game end
		socket.on("end", function(result){
			signal.end.play();
			
			result.players.forEach(function(p, idx){
				$('ul', '#p'+idx).append('<li><span class="badge points">'+p.points+' Punkte</span></li>');
			});
			$('#status').text($('.name','#p'+result.winner).text()+" hat gewonnen!").fadeIn();

		});
		
		socket.on('gamedata', function(data){

			// names
			if (data.hasOwnProperty("player1") && data.player1) $('.name','#p0').text(data.player1);
			if (data.hasOwnProperty("player2") && data.player2) $('.name','#p1').text(data.player2);

			// route
			if (data.hasOwnProperty("from") && data.from) $('#from').text(data.from);
			if (data.hasOwnProperty("to") && data.to) $('#to').text(data.to);

			// ready? FIXME
			// if (data.hasOwnProperty("ready") && data.ready) $('#to').text(data.from);

		});
		
		// dings
		socket.on("dings", function(){
			signal.special.play();
			$('#dings').css("z-index","1000").show();
			setTimeout(function(){
				$('#dings').css("z-index","-1").hide();
			},30000);
		});

		// scroll down in scores
		setInterval(function(){
			$(".col ul", "#scores").scrollTop(10000);
		},100);
		
		// sound
		var background = new $.mediaAudio(['/assets/sound/background.ogg', '/assets/sound/background.mp3']);
		background.preload('auto');
		background.loop(true);
		background.volume(0.5);

		var signal = {};
		["start","end","malus","bonus","article","special"].forEach(function(x){
			signal[x] = new $.mediaAudio(['/assets/sound/'+x+'.ogg', '/assets/sound/'+x+'.mp3']);
			signal[x].preload('auto');
			signal[x].volume(1);
		});
		
	};
	
	// reset
	socket.on('reset', function(data){
		$('#main').html('<h1 id="reset">Reset</h1>');
		setTimeout(function(){
			location.reload();
		}, 3000);
	});
	
	// timer code (because we use this everywhere)
	var timer = null;
	socket.on('timer-reset', function(data){
		if (timer) clearInterval(timer);
		if (!data) var data = 300;
		$('#timer').text(data);
		if (background) background.stop();
	});
	socket.on('timer-end', function(data){
		if (timer) clearInterval(timer);
		if (!data) var data = 300;
		$('#timer').text(data);
		if (background) background.stop();
	});
	socket.on('timer-pause', function(data){
		if (timer) clearInterval(timer);
		if (data) $('#timer').text(data);
		if (background) background.pause();
	});
	socket.on('timer-start', function(data){
		if (timer) clearInterval(timer);
		if (!data) var data = 300;
		$('#timer').text(data.toString());
		var end = Date.now()+(data*1000)
		timer = setInterval(function(){
			$('#timer').text((((end-Date.now())/1000)|0).toString());
		},100);
		if (signal) signal.start.play();
		if (background) background.play();
	});
	
	// fix spinner on chrome
	$("i", "#spinner").css({top: Math.round($(window).innerHeight()/2)});
});