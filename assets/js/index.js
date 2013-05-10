
io = io.connect();

$(document).ready(function(){

	/* admin */
	if ($('body.admin').length > 0) {
		io.emit('admin');
		$('#round-new').click(function(evt){
			io.emit('round-new');
		});
		$('#round-start').click(function(evt){
			io.emit('round-start');
		});
		$('#reset').click(function(evt){
			io.emit('reset');
		});
		$('#startsplash').click(function(evt){
			io.emit('startsplash');
		});
		io.on('new-round', function(data){
			$('#from').text(data.from.lemma);
			$('#to').text(data.to.lemma);
		});
		io.on('set-player', function(data){
			switch (data.player.toString()) {
				case '1': var e = $('#player1'); break;
				case '2': var e = $('#player2'); break;
			}
			if (data.name !== null) {
				e.text(data.name);
			} else {
				e.html('<em>None (Set)</em>');
			}
		});
		io.on('log', function(data){
			$('#log').append('<p>'+data+'</p>');
		});
	}

	/* stats */
	
	if ($('body.stats').length > 0) {

		io.emit('stats-subscribe');

		io.on('stats', function(data) {
			$('#from').text(((data.from) ? data.from.lemma : ""));
			$('#to').text(((data.to) ? data.to.lemma : ""));
			$('#player1 .name').html((data.player1 || "<em>Player 1</em>"));
			$('#player2 .name').html((data.player2 || "<em>Player 2</em>"));
			switch (data.game) {
				case "wait": $('#state').text('READY').css('background-color','#000'); break;
			}
		});

		io.on('stats-article', function(data){
			var $p = $("#player"+data.player);
			var oldarticle = $('.article', $p).text();
			if (oldarticle !== "") {
				$('.history', $p).prepend('<p>'+oldarticle+'</p>');
			}
			$('.article', $p).text(data.article.lemma);
		});
		
		io.on('bonus', function(data){
			$('#player'+data.player+' .history').prepend('<p class="bonus">'+data.txt+'</p>');
		});

		io.on('malus', function(data){
			$('#player'+data.player+' .history').prepend('<p class="malus">'+data.txt+'</p>');
		});

		io.on('winner', function(data){
			countdown_stop('END');
			$('#splash').html('Player '+data.winner+' <em>'+data.winner_name+'</em> WIN<br /><small>Player 1: '+data.score1+' Punkte</small><br /><small>Player 2: '+data.score2+' Punkte</small>');
			$('body').addClass('splash');
		});
		
		io.on('player-done', function(data){
			$('#player'+data.player).addClass('done');
		});
		
		
		io.on('timer-start', function(t){
			countdown_start(t, '#state');
		});

	}

	/* play */
		
	if ($('body.play').length > 0){
		
		/* say hello to the server */
		io.emit('ready');
		/* set player name */
		$('#enter-name').submit(function(){
			io.emit('set-name', $('#name').val());
			$('#name').val('');
		});

		io.on('show-login', function(data) {
			$('#main').attr('class','show-login');
			$('#name').focus();
		});
		
		io.on('show-play', function(data) {
			$('#main').attr('class','show-play');
		});

		io.on('show-wait', function(data) {
			$('#main').attr('class','show-wait');
			if (data !== null && ('to' in data)) {
				$('#preview').html("Von <em>"+data.from.lemma+'</em><br />Bis <em>'+data.to.lemma+'</em>');
				$('#destination').text(data.to.lemma);
				$('#article-headline').text(data.from.lemma);
				io.emit('article', data.from);
			} else {
				$('#preview').html('');
			}
		});

		io.on('set-destination', function(data){
			$('#destination').text(data.lemma);
		});
		
		io.on('load-article', function(data){
			$('#article-headline').text(data.lemma);
			io.emit('article', data);
		});

		io.on('article', function(data){
			var $article = $('<div></div>').html(data.html);
			$('#article-content').html($article);
			$('#article').scrollTop(0);
			$('a', $article).each(function(idx,a){
				var $a = $(a);
				var slug = $a.attr('href').replace(/#.*$/,'').split(/\//).pop();
				if (slug !== '') {
					$a.click(function(evt){
						evt.preventDefault();
						$('#article-headline').text($a.attr('title'));
						io.emit('article', {
							slug: decodeURIComponent(slug),
							lemma: $a.attr('title')
						});
					});
				}
			});
		});
		
		io.on('timer-start', function(t){
			countdown_start(t, '#clock');
		});
		
		io.on('winner', function(data){
			countdown_stop('END');
		});
		
	};

	/* splash */
	
	io.on('splash', function(text) {
		$('#splash').text(text);
		$('body').addClass('splash');
	});
	
	$('#splash').click(function(){
		$('body').removeClass('splash');
	});
	
	/* reload */
	
	io.on('reload', function(){
		setTimeout(function(){
			(window||document).location.reload(true);
		},3000);
	});

	/* countdown */
	
	io.on('round-end', function(){
		if (countdown_timer !== null) {
			countdown_stop("END");
		} 
	});
	
	var countdown_timer = null;
	var countdown_element = null;
	var countdown_start = function(t, e) {
		countdown_element = $(e);
		var endtime = new Date();
		endtime.setTime(parseInt(t,10));
		console.log(endtime.getTime());
		countdown_timer = setInterval(function(){
			countdown_element.text(Math.round((endtime.getTime()-(new Date()).getTime())/1000).toString());
		},333);
	}
	var countdown_stop = function(txt) {
		clearInterval(countdown_timer);
		countdown_timer = null;
		countdown_element.text(txt);
	}

});


