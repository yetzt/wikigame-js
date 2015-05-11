#!/usr/bin/env node

// node modules
var path = require("path");
var fs = require("fs");

// npm modules
var debug = require("debug")("6deg:wp");
var scrapyard = require("scrapyard");

// base url
var BASE_URL = "http://de.wikipedia.org/wiki/";

// initialize scrapyard
var retrieve = new scrapyard({
	debug: false,
	cache: false, 
	retries: 5,
	connections: 5,
	bestbefore: "5min"
}).scrape;

function wp(){
	if (!(this instanceof wp)) return new wp();

	// keep reference
	var self = this;

	// load pages
	try {
		self.pages = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../data/pages.json")))
		debug("[init] pages loaded");
	} catch (err) {
		debug("[init] error loading pages: %s", err) || process.exit();
	}

	// load bonus
	try {
		self.boni = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../data/bonus.json")))
		debug("[init] bonus loaded");
	} catch (err) {
		debug("[init] error loading bonus: %s", err) || process.exit();
	}
	
	return this;

};

wp.prototype.get = function(lemma, fn){
	debug("[get] retrieving: %s", lemma);
	retrieve({
		url: BASE_URL+lemma,
		type: 'html',
		encoding: 'utf-8',
		merhod: 'GET'
	}, function(err, $){
		
		if (err) return debug("[get] error: %s", err) || fn(err);
		
		var $wp = $("#mw-content-text");
		
		// remove all external links
		$("a[href]", $wp).each(function(idx,e){
			if (!/^\/wiki\//.test($(this).attr("href"))) $(this).replaceWith($(this).text());
		});
		
		// return bare html
		fn(null, $wp.html().toString());
		
	});
};

// generate random 10-50 bonus points
wp.prototype.rand = function(){
	return 10+((Math.random()*40|0));
};

wp.prototype.bonus = function(lemma, history, fn){
	var self = this;
	var boni = [];
	// try page bonus
	if (self.boni["+"].hasOwnProperty(lemma)) boni.push([self.rand(), self.boni["+"][lemma]]);
	if (self.boni["-"].hasOwnProperty(lemma)) boni.push([self.rand()*-1, self.boni["-"][lemma]]);
	// check history for looping bonus
	if (history.indexOf(lemma) >= 0) boni.push([self.rand(), "Looping-Bonus"]);	
	// random bonus
	if (Math.random() > 0.97) boni.push([self.rand(), "Zufallsbonus"]);
	else if (Math.random() < 0.03) boni.push([self.rand()*-1, "Zufallsmalus"]);
	return fn(boni);
};

// check 
wp.prototype.check = function(lemma, fn){
	var self = this;
	if (/^Liste /.test(lemma)) {
		return fn("Keine Listen.");
	} else if (/^Kategorie:/.test(lemma)) {
		return fn("Keine Kategorien.");
	} else if (/^Portal:/.test(lemma)) {
		return fn("GLaDOS Error: Portal nicht verfügbar.");
	} else if (/^Wikipedia:/.test(lemma)) {
		return fn("Kein Metadings");
	} else if (/^Benutzer:/.test(lemma)) {
		return fn("Keine Benutzerseiten");
	} else if (/^Diskussion:/.test(lemma)) {
		return fn("Keine Debatten");
	} else if (/^Spezial:/.test(lemma)) {
		return fn("Keine Spezialseiten");
	} 
	return fn(null);
};

// select random page
wp.prototype.page = function(){

	// keep reference
	var self = this;

	// select random page
	return self.pages[(Math.random()*self.pages.length)|0];

};

wp.prototype.pair = function(){

	// keep reference
	var self = this;

	// make pair
	var pair = [self.page()];
	while (pair.length !== 2) {
		pair.push(self.page());
		if (pair[0] === pair[1]) pair.pop();
	}
	return pair;

};

if (module.parent === null) {
	// execute examples
	var _wp = wp();
	var _pair = _wp.pair();
	debug("%s ↔ %s", _pair[0], _pair[1]);
	_wp.get(_wp.page(), function(err, data){
		console.log(data);
	});
} else {
	module.exports = wp;	
}
