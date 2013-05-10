#!/usr/bin/env node


var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var colors = require('colors');
var mustache = require('mustache');
var express = require('express.io');
var scrapyard = require('scrapyard');
var config = require(path.resolve(__dirname, './config.js'));

/* load article names and shuffle them */
var articles = JSON.parse(fs.readFileSync(path.resolve(__dirname,'data/articles.json'))).sort(function(a,b){
	return (Math.random() > 0.5);
});

/* bootstrap scraper */
var scraper = new scrapyard({
    cache: './storage', 
    debug: false,
    timeout: 100000,
    retries: 3,
    connections: 5
});

/* boot express.io */
var app = express().http().io();
app.listen(config.port);

/* object for players */
var players = {};
var io = {};
var state = {
	game: "off",
	from: null,
	to: null
}


/* handle uncaught exception, just in case */
/* process.on('uncaughtException', function (err) {
	console.log('Caught exception: ' + err);
}); */

/* read templates */
var tmpl = {
	index: fs.readFileSync(path.resolve(__dirname, "assets/tmpl/index.mustache")).toString(),
	stats: fs.readFileSync(path.resolve(__dirname, "assets/tmpl/stats.mustache")).toString(),
	play: fs.readFileSync(path.resolve(__dirname, "assets/tmpl/play.mustache")).toString(),
	player: fs.readFileSync(path.resolve(__dirname, "assets/tmpl/player.mustache")).toString(),
	admin: fs.readFileSync(path.resolve(__dirname, "assets/tmpl/admin.mustache")).toString()
}

app.use("/assets", express.static(path.resolve(__dirname, 'assets')));
app.use(express.cookieParser());
app.use(express.session({secret: 'blafasel'}));

/* admin connection */
app.get('/admin', function(req, res){
	res.setHeader('Content-Type', 'text/html; charset=utf-8');
	res.send(mustache.render(tmpl.index, {
		"class": "admin"
	},{
		"content": tmpl.admin
	}));
});

app.get('/play', function(req, res){
	/* set session and stuff */
	res.setHeader('Content-Type', 'text/html; charset=utf-8');
	res.send(mustache.render(tmpl.index, {
		"class": "player"
	},{
		"content": tmpl.player
	}));
});

/* player connection */
app.get('/play/:id', function(req, res){
	if (!("playerid" in req.session)) {
		/* set session and stuff */
		var id = req.params.id.toString();
		players[id] = {
			io: null,
			name: null,
			article: null,
			stats: {
				done: false,
				clicks: 0,
				starttime: null,
				endtime: null,
				bonus: 0,
				score: 0,
				history: []
			}
		};
		/* set player name to empty */
		if (("admin" in io) && io.admin) {
			io.admin.emit('set-player', {
				player: id,
				name: null
			});
		}
		req.session.playerid = id;
	}
	res.setHeader('Content-Type', 'text/html; charset=utf-8');
	res.send(mustache.render(tmpl.index, {
		"class": "play"
	},{
		"content": tmpl.play
	}));
});

/* view game stats */
app.get('/', function(req, res){
	res.setHeader('Content-Type', 'text/html; charset=utf-8');
	res.send(mustache.render(tmpl.index, {
		"class": "stats"
	},{
		"content": tmpl.stats
	}));
});

app.get('*', function(req, res){
	res.status(404);
	res.setHeader('Content-Type', 'text/html; charset=utf-8');
	res.send("<h1>404</h1>");
});

/* play */
app.io.route('ready', function(req) {
	console.log("--------------- ready ---------------".magenta);
	if (!('playerid' in req.session) || !(req.session.playerid in players)) {
		console.log('no id in session or players');
		/* something went wrong */
	} else {
		var id = req.session.playerid.toString();
		console.log('player', id);
		players[id].io = req.io;
		if (players[id].name === null) {
			req.io.emit('show-login');
		} else {
			/* FIXME: is round active? */
			switch (state.game) {
				case "off": 
					/* wait screen */
					req.io.emit('show-wait');
				break;
				case "wait": 
					/* load article and show wait screen */
					if (players[id].article !== null) {
						req.io.emit('load-article', players[id].article);
					} else {
						req.io.emit('load-article', state.from);
					}
					if (state.to !== null) {
						req.io.emit('set-destination', state.to);
					}
					req.io.emit('show-wait');
				break;
				case "play": 
					/* load current article and show play screen */
					if (players[id].article !== null) {
						req.io.emit('load-article', players[id].article);
					} else {
						req.io.emit('load-article', state.from);
					}
					if (state.to !== null) {
						req.io.emit('set-destination', state.to);
					}
					req.io.emit('show-play');
				break;
			}
		}
	}
});

app.io.route('set-name', function(req) {
	console.log("--------------- set name ---------------".magenta);
	if (!('playerid' in req.session) || !(req.session.playerid in players)) {
		console.log('no id in session or players');
		/* something went wrong */
	} else {		
		var id = req.session.playerid;
		console.log('player', id);
		console.log('got name:',req.data);
		players[id].name = req.data;
		/* set admin blafoo */
		if (("admin" in io) && io.admin) {
			io.admin.emit('set-player', {
				player: id,
				name: req.data
			});
		}
		/* FIXME: is round active? */
		req.io.emit('show-wait');
		/* update stats */
		update_stats();
		/* fixme: set admin */
	}
});

app.io.route('article', function(req) {
	
	console.log("--------------- article ---------------".magenta);
	console.log('FETCH'.inverse.yellow.bold, req.data.lemma.white, 'for Player'.yellow, req.session.playerid.toString().white);

	var id = req.session.playerid.toString();

	if (req.data.lemma.match(/^Liste /)) {
		req.io.emit("splash", "Keine Listen.");
	} else if (req.data.lemma.match(/^Kategorie:/)) {
		req.io.emit("splash", "Keine Kategorien.");
	} else if (req.data.lemma.match(/^Portal:/)) {
		req.io.emit("splash", "GLaDOS Error: Portal nicht verfügbar.");
	} else if (req.data.lemma.match(/^Wikipedia:/)) {
		req.io.emit("splash", "Kein Metadings");
	} else if (req.data.lemma.match(/^Benutzer:/)) {
		req.io.emit("splash", "Keine Benutzerseiten");
	} else if (req.data.lemma.match(/^Diskussion:/)) {
		req.io.emit("splash", "Keine Debatten");
	} else if (req.data.lemma.match(/^Spezial:/)) {
		req.io.emit("splash", "Keine Soezialseiten");
	} else if (req.data.slug === state.to.slug) {

		/* we have a winner here! */
		console.log("FINISH".inverse.bold.magenta, id.green.bold);
		
		/* endtime */
		players[id].stats.done = true;
		players[id].stats.endtime = (new Date()).getTime();
		players[id].stats.bonus += 50;
		
		// HERE
		
		app.io.room('stats').broadcast('stats-article', {
			"player": id,
			"article": req.data
		});
		app.io.room('stats').broadcast('player-done', {
			"player": id
		});
		
		/* splash screen */
		req.io.emit('splash', "Geschafft!");
		/* clear article */
		req.io.emit('article', {"html": ""});

		/* check if all players are finished */
		if (players["1"].stats.endtime !== null && players["2"].stats.endtime !== null) {
			end_round();
			console.log("END ROUND");
		} else {
			players[id].stats.bonus += 50;
		}

	} else {
		scrape(req.data.slug, function(err, content){
			if (err) {
				io.emit("splash", "Konnte Artikel '"+req.data.lemma+"' nicht laden.")
				console.log("ARTICLE".inverse.bold.red, "error loading".white, req.data.lemma.red);
			} else {
				req.io.emit('article', {
					"html": content
				});
				if (players[id].article !== null && players[id].article.lemma !== req.data.lemma) {

					/* bonus code goes here*/
					if (players[id].stats.history.indexOf(req.data.lemma) >= 0) {
						players[id].stats.bonus += 1;
						req.io.emit('bonus', '+1 Looping Bonus')
						app.io.room('stats').broadcast('bonus', {'player':id,'txt':'+1 Looping Bonus'});
					}

					if (req.data.lemma.match(/Hitler|Nazi|Nationalsozialismus|Martin Bormann|Philipp Bouhler|Kurt Daluege|Wilhelm Frick|Joseph Goebbels|Hermann Göring|Ernst Hanfstaengl|Rudolf Heß|Heinrich Himmler|Ernst Röhm|Albert Speer|Adolf Eichmann|Josef Mengele/i)) {
						players[id].stats.bonus -= 1;
						req.io.emit('malus', '-5 Nazimalus');
						app.io.room('stats').broadcast('malus', {'player':id,'txt':'-5 Nazimalus'});
					}

					if (req.data.lemma.match(/Sex|Koitus|Geschlechtsverkehr|Libido|Fortpflanzung|Begattung|Analverkehr|Petting|Vaginalverkehr|Pegging|Fellatio|Cunnilingus|Anilingus/i)) {
						players[id].stats.bonus += 1;
						req.io.emit('bonus', '+1 Sexbonus');
						app.io.room('stats').broadcast('bonus', {'player':id,'txt':'+1 Sexbonus'});
					}

					if (req.data.lemma.match(/Penis|Vulva|Vagina/i)) {
						players[id].stats.bonus += 3;
						req.io.emit('bonus', '+3 Genitalbonus');
						app.io.room('stats').broadcast('bonus', {'player':id,'txt':'+3 Genitalbonus'});
					}

					if (req.data.lemma.match(/Sascha Lobo/i)) {
						players[id].stats.bonus += 2;
						req.io.emit('bonus', '+2 Saschalobonus');
						app.io.room('stats').broadcast('bonus', {'player':id,'txt':'+2 Saschalobonus'});
					}

					console.log("ARTICLE".inverse.bold.green, "player click".white);
					players[id].stats.clicks++;
					players[id].stats.history.push(req.data.lemma);
					
					if (players[id].stats.starttime === null) players[id].stats.starttime = (new Date()).getTime();
					app.io.room('stats').broadcast('stats-article', {
						"player": id,
						"article": req.data
					});
					
				};
				players[id].article = req.data;
			}
		});
	}
});

/* stats */
app.io.route('stats-subscribe', function(req) {
	console.log("STATS".yellow.inverse.bold, "new subscriber".white);
	req.io.join('stats');
	update_stats(req.io);
});

/* admin */
app.io.route('admin', function(req) {
	/* set admin connection */
	io.admin = req.io;
	/* FIXME: send admin data of current round */
});

app.io.route('round-new', function(req){
	/* pick two articles and start a new round */
	picktwo(function(articles){
		console.log("INFO".yellow.inverse.bold, "new round:".yellow, articles.from.lemma.white, '➔'.yellow, articles.to.lemma.white);
		/* set state */
		state.game = "wait";
		state.from = articles.from;
		state.to = articles.to;
		/* send to players */
		sendplayers('show-wait', articles);
		/* admin */
		req.io.emit("new-round", articles);
		/* send to stats room */
		update_stats();
	});
});

app.io.route('round-start', function(req){
	/* pick two articles and start a new round */
	picktwo(function(articles){
		state.game = "play";
		sendplayers('show-play', articles);
		/* FIXME: send to stats room */
		/* FIXME: send to admin */
		
		/* start round timer */
		state.starttime = (new Date()).getTime();
		console.log("round starttime:", state.starttime);
		app.io.broadcast("timer-start", state.starttime+config.round_length);
		state.timer = setTimeout(function(){
			end_round();
		}, config.round_length);
	});
});

app.io.route('reset', function(req){
	app.io.broadcast("splash", "Reloading...");
	app.io.broadcast("reload");
	process.exit();
});

app.io.route('startsplash', function(req){
	app.io.room('stats').broadcast("splash", "Six Degrees of Wikipedia");
});

/* helpers */

var end_round = function(){
	/* everything finished. */
	clearTimeout(state.timer);
	app.io.broadcast("round-end");
	state.endtime = (new Date()).getTime();
	console.log("round endtime:", state.endtime);
	
	state.game = "off";

	/* decide winner */

	state.roundtime = Math.round((state.endtime-state.starttime)/1000);

	if (players["1"].stats.endtime === null) players["1"].stats.endtime = state.endtime;
	if (players["2"].stats.endtime === null) players["2"].stats.endtime = state.endtime;

	if (players["1"].stats.starttime === null) players["1"].stats.starttime = state.starttime;
	if (players["2"].stats.starttime === null) players["2"].stats.starttime = state.starttime;

	players["1"].stats.roundtime = Math.round((players["1"].stats.endtime-players["1"].stats.starttime)/1000);
	players["2"].stats.roundtime = Math.round((players["2"].stats.endtime-players["2"].stats.starttime)/1000);

	players["1"].stats.score = (state.roundtime - players["1"].stats.roundtime) + ((config.click_inkl - players["1"].stats.clicks) * config.click_weight) + (players["1"].stats.bonus);
	players["2"].stats.score = (state.roundtime - players["2"].stats.roundtime) + ((config.click_inkl - players["2"].stats.clicks) * config.click_weight) + (players["2"].stats.bonus);

	/*
	console.log("---------- PLAYER 1 ----------".inverse.bold.cyan);
	console.log("time:".cyan.bold, players["1"].stats.roundtime);
	console.log("time:".cyan.bold, players["1"].stats.roundtime);
	*/
	
	if (players["1"].stats.score == players["2"].stats.score) {
		/* FIXME: decide by random generator */
		state.winner = (Math.random() < 0.5) ? "2" : "1";
	} else if (players["1"].stats.score > players["2"].stats.score) {
		/* player 1 wins */
		state.winner = "1";
	} else {
		/* player 2 wins */
		state.winner = "2";
	}

	console.log("WINNER".inverse.bold.magenta, state.winner);
	console.log("SCORE 1".inverse.bold.magenta, players["1"].stats.score);
	console.log("SCORE 2".inverse.bold.magenta, players["2"].stats.score);

	if (!players["1"].stats.done) players["1"].io.emit("splash", "Timeout");
	if (!players["2"].stats.done) players["2"].io.emit("splash", "Timeout");
	sendplayers("show-wait", null);
	
	/* fixme: send data */
	app.io.broadcast("winner", {
		"winner": state.winner,
		"winner_name": players[state.winner].name,
		"winner_score": players[state.winner].stats.score,
		"score1": players["1"].stats.score,
		"score2": players["2"].stats.score
	});
	console.log("broadcast winner");
	
}

/* generate session ids */
var genid = function(callback) {
	crypto.randomBytes(48, function(ex, buf) {
		callback(buf.toString('hex'));
	});
};

/* pick two articles */
var picktwo = function(callback) {
	callback({
		"from": articles.pop(),
		"to": articles.pop()
	});
}

/* send event to all players */
var sendplayers = function(evt, data) {
	for (id in players) {
		players[id].io.emit(evt, data);
	}
}

/* scrape wikipedia entry */
var scrape = function(slug, callback) {
	scraper.scrape(config.base+slug, 'html', function(err,$){
		if (err) {
			console.error('ERR'.red.inverse.bold, 'scrape'.red, err);
			callbacl(err);
		} else {
			callback(null, $(config.selector).html().toString());
		}
	});
};

var update_stats = function(__io){
	
	var _data = {
		from: state.from,
		to: state.to,
		game: state.game,
		player1: ("1" in players) ? players["1"].name || null : null,
		player2: ("2" in players) ? players["2"].name || null : null
	};
	
	if (__io !== undefined) {
		console.log("STATS".yellow.inverse.bold, "sending stats".white);
		__io.emit('stats', _data);
	} else {
		console.log("STATS".yellow.inverse.bold, "broadcasting stats".white);
		app.io.room('stats').broadcast('stats', _data);
	}
}
