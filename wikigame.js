#!/usr/bin/env node

// require node modules
var crypto = require("crypto");
var http = require("http");
var path = require("path");

// require npm modules
var cookieparser = require("cookie-parser");
var mustache = require("mustache-express");
var socketio = require("socket.io");
var session = require("express-session");
var express = require("express");
var moment = require("moment");
var debug = require("debug")("6deg:wikigame");

// require local modules
var wp = require("./lib/wp.js")();
var game = require("./lib/game.js");

// get new instance of express
var app = express();

// create server for app
var server = http.Server(app);

// bind socket.io to sever
var io = socketio(server)

// bind server to port
server.listen(8888, function(){
	debug("listening");
});

// initialize cookie parser and sessions with a random secret
var cookie_secret = crypto.randomBytes(256).toString('hex');
app.use(cookieparser(cookie_secret));
app.use(session({
	resave: true,
	saveUninitialized: true,
	secret: cookie_secret
}));

// use mustache as view engine
app.engine("mustache", mustache());
app.set("views", path.resolve(__dirname, "assets/views"));
app.set("view engine", "mustache");
app.set("view cache", false);

// serve static assets
app.use('/assets', express.static(path.resolve(__dirname, 'assets')));

// default express route
app.get("/", function(req, res){
	res.render("index", {});
});

// admin interface
app.get("/a", function(req, res){
	res.render("admin", {});
});

// set player id
app.get("/p/:id", function(req, res){
	if ([0,1].indexOf(parseInt(req.params.id,10)) >= 0) {
		req.session.playerid = parseInt(req.params.id,10);
	}
	res.redirect("/p");
});

// player interface
app.get("/p", function(req, res){
	if (!req.session.hasOwnProperty("playerid")) {
		res.render("select", {});
	} else {
		res.render("play", {id: req.session.playerid});
	}
});

// game
var g = new game();

// socket.io routes
io.on('connection', function(socket) {
	debug("received connection");

	// save admin socket
	socket.on('player', function(data) {
		debug("received player socket");
		socket.join("player");
		socket.emit("player-getid");
	});

	// set id and wait
	socket.on('player-setid', function(playerid) {
		socket.playerid = playerid;
		debug("name of %d is %s", playerid, g.players[socket.playerid].name);
		if (!g.players[socket.playerid].name) {
			io.to("admin").emit("set-player", {player: socket.playerid, name: g.players[socket.playerid].name});
			return socket.emit("player-getname");
		}
		
		if (g.started) {
			// determine latest page
			if (g.players[socket.playerid].history.length > 0) {
				var latest = g.players[socket.playerid].history.pop();
//				g.players[socket.playerid].history.push(latest);
			} else {
				var latest = g.pair[0];
			}
			socket.emit("game-resume", {
				"destination": g.pair[1],
				"article": latest
			});
		} else {
			socket.emit("game-wait");
		}
	});

	// set name and emit wait
	socket.on('player-setname', function(playername) {
		debug("setname for plaxer %d as %s", socket.playerid, playername);
		if (!playername || typeof playername !== "string" || playername === "") var playername = "Player "+socket.playerid;
		g.players[socket.playerid].name = playername;
		io.emit("gamedata", g.get());
		if (g.started) {
			socket.emit("game-resume");
		} else {
			socket.emit("game-wait");
		}
	});
	
	socket.on("player-request", function(article){
		// check if player has finished
		if (g.players[socket.playerid].finished === true) {
			return socket.emit("finish");
		};
		// check for violations
		debug("player request: %s", article);
		wp.check(article, function(viol){
			if (viol) {
				// FIXME: violation
				debug("VIOLATION: %s", viol);
				socket.emit("violation", viol);
			} else {
				debug("no violations");
				// check for bonus
				wp.bonus(article, g.players[socket.playerid].history, function(bonus){
					debug("bonus checked");
					if (bonus.length > 0) {
						bonus.forEach(function(b){
							g.players[socket.playerid].bonuses.push(b);
						});
					} 
					// add to history
					g.players[socket.playerid].history.push(article);

					// emit for display call
					io.emit("player-stat", {
						player: socket.playerid,
						article: article,
						bonus: bonus
					});
					
					// check end
					if (article.toLowerCase() === g.pair[1].toLowerCase()) {
						debug("finish");
						g.players[socket.playerid].finished = true;
						g.players[socket.playerid].timeleft = (g.time+0);
						socket.emit("finish");
						// emit for display and admin
						io.to("admin").emit("log", moment().format("HHmmss")+" finish p"+socket.playerid);
						io.emit("player-finish", {
							player: socket.playerid
						});
						// check game end
						g.check();
					} else {
						debug("get article");
						// get article
						wp.get(article, function(err, html){
							if (err) {
								// FIXME do all sorts of error stuff
								debug("error retrieving article %s for player %d: %s", article, socket.playerid, err);
								io.to("admin").emit("log", moment().format("HHmmss")+" error p"+socket.playerid+" "+article+": "+err);
								socket.emit("warning", "Artikel konnte nicht abgerufen werden.");
							} else {
								// emit
								socket.emit("player-response", {
									title: article,
									html: html
								});
							}
						});
					}
				});
			}
		});
	});

	// save admin socket
	socket.on('admin', function(data) {
		debug("received admin socket");
		socket.join("admin");
		
		// FIXME: send admin data of current round
		socket.emit("gamedata", g.get());

	});
	
	// admin: new game
	socket.on('round-new', function(){
				
		// get new pair
		g.pair = wp.pair();

		// emit current state to everyone
		io.to("player").emit("player-pair", g.pair);
		io.emit("gamedata", g.get());
		io.emit("ready");
		
	});
	
	// admin: dings
	socket.on('dings', function(){
		io.to('display').emit("dings");
	});

	// admin: start the game
	socket.on('round-start', function(){
		
		g.start(function(){

			// game started
			io.emit('timer-start');
			io.emit('start');
			io.to("admin").emit("log", moment().format("HHmmss")+" game started");

		},function(players){
			
			var result = {
				winner: ((players[0].winner === true) ? 0 : 1),
				players: players
			};

			// game ended
			io.to("admin").emit("log", moment().format("HHmmss")+" game ended, winner: "+result.winner);
			io.emit('end', result);
			io.emit('timer-end', g.time);
			
		});
		
	});
	
	// admin: reset
	socket.on('admin-reset', function(){
		io.emit("reset");
		process.exit();
	});
	
	// admin: pause the game
	socket.on('round-pause', function(){
		io.emit("pause");
		g.pause(function(timeleft){
			io.emit("timer-pause", timeleft);
		});
	});

	// admin: resume the game
	socket.on('round-resume', function(){
		io.emit("resume");
		g.resume(function(timeleft){
			io.emit("timer-start", timeleft);
		});
	});

	// save admin socket
	socket.on('display', function(data) {
		debug("received display socket");
		socket.join("display");

		// FIXME: send display data of current round
		socket.emit("gamedata", g.get());
		
		io.to("admin").emit("log", "new display");
		
		// FIXME
		/*
		setInterval(function(){
			io.emit("ready");
		},5000);
		*/
						
	});

});

/*
setInterval(function(){
	io.to("admin").emit('set-player', {
		player: 1,
		name: "yetzt"
	});
},1000);
*/