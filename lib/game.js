#!/usr/bin/env node

// node modules
var debug = require("debug")("6deg:game");

function game(){
	if (!(this instanceof game)) return new game();
	
	// keep reference
	var self = this;
	
	// create new game
	self.players = []
	while (self.players.length < 2) self.players.push({
		name: null,
		points: 0,
		bonuses: [],
		history: [],
		taken: false,
		finished: false,
		timeleft: 0,
		winner: false
	});
	self.pair = [null,null];
	
	self.ready = false;

	self.time = 300;
	self.timer = null;
	self.endtime = null;
	self.started = false;
	self.ended = null;
		
	return this;
};

game.prototype.setpair = function(pair){
	var self = this;
	self.pair = pair;
	self.ready();
};

game.prototype.checkready = function(){
	var self = this;
	if ((self.players[0].name !== null) && (self.players[1].name !== null) && (self.pair[0] !== null)) self.ready = true;
	return this;
};

game.prototype.makeresult = function(){
	var self = this;
	self.players.forEach(function(p){
		p.points = 0;
		// 5 points for each second left
		p.points += (5*(p.timeleft|0));
		// -5 points for every article clicked
		p.points -= (5*p.history.length);
		// 50 points for finished
		if (p.finished) p.points += 50;
		// bonus points
		p.bonuses.forEach(function(b){
			p.points += b[0];
		});
	});
	// cointhrow
	if (self.players[0].points === self.players[1].points) {
		debug("throwing coin");
		self.players[Math.round(Math.random())].points += 1;
	}
	if (self.players[0].points > self.players[1].points) {
		self.players[0].winner = true;
	} else {
		self.players[1].winner = true;
	}
	return this;
};

game.prototype.start = function(started, ended){
	var self = this;

	// safekeep end callback
	self.ended = ended;

	// clear timer
	if (self.timer) clearInterval(self.timer);

	// set new endtime
	self.endtime = (Date.now()+(self.time*1000));

	// signal start
	self.started = true;
	started();

	// check for end every 100 ms
	self.timer = setInterval(function(){
		self.check();
	},100);

};

game.prototype.pause = function(fn){
	var self = this;

	clearInterval(self.timer);
	debug("[pause] game paused at %d", self.time);
	if (fn) fn(self.time);
};

game.prototype.resume = function(fn){
	var self = this;

	// set new endtime
	self.endtime = (Date.now()+(self.time*1000));
	if (fn) fn(self.time);

	// check for end every 100 ms
	self.timer = setInterval(function(){
		self.check();
	},100);
	
};

// check if end timer was reached or both players were winished
game.prototype.check = function(){
	var self = this;

	// keep current diff
	self.time = (((self.endtime-Date.now())/1000)|0)

	// check if game has ended
	if (!self.endtime || Date.now() > self.endtime || (self.players[0].finished && self.players[1].finished)) {

		// clear interval
		clearInterval(self.timer);

		// reset started
		self.started = false;

		// calculate result
		self.makeresult();
		
		// call back end timer
		self.ended(self.players);

	};
	
};

game.prototype.get = function(){
	var self = this;
	self.checkready();
	return {
		"time": self.time,
		"player1": self.players[0].name,
		"player2": self.players[1].name,
		"from": self.pair[0],
		"to": self.pair[1],
		"ready": self.ready
	};
};

module.exports = game;