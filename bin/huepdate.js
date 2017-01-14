#!/usr/bin/env node

var host = '';
var user = '';

var fs = require('fs');
var request = require('request');
var async = require('async');

var config = require('./huepdate.json');

var lights_map = {};
var sensors_map = {};

var find_key_in_array = function (haystack, needle) {
	for (var key in haystack) {
		var value = haystack[key];
		if (needle.substr(0, value.length) === value) {
			return value;
		}
	}
};

request('http://' + host + '/api/' + user, function (err, res, body) {
	if (err) {
		throw err;
	}
	var huedat = JSON.parse(body);
	async.everySeries(Object.keys(huedat.lights), function (id, cb) {
		if (!huedat.lights[id].uniqueid || !huedat.lights[id].name) {
			return cb(null, true);
		}
		var mac = find_key_in_array(Object.keys(config.lights), huedat.lights[id].uniqueid);
		if (!mac) {
			return cb(null, true);
		}
		var name = config.lights[mac];
		lights_map[mac] = id;
		if (huedat.lights[id].name === name) {
			return cb(null, true);
		}
		console.log('LIGHT  RENAME', id, huedat.lights[id].name, '->', name);
		request.put('http://' + host + '/api/' + user + '/lights/' + id, {form: JSON.stringify({name: name})}, function (err, res, body) { cb(null, true); });
	}, function (err, result) {
		async.everySeries(Object.keys(huedat.sensors), function (id, cb) {
			if (!huedat.sensors[id].uniqueid || !huedat.sensors[id].name) {
				return cb(null, true);
			}
			var mac = find_key_in_array(Object.keys(config.sensors), huedat.sensors[id].uniqueid);
			if (!mac) {
				return cb(null, true);
			}
			var name = config.sensors[mac];
			sensors_map[mac] = id;
			if (huedat.sensors[id].name === name) {
				return cb(null, true);
			}
			console.log('SENSOR RENAME', id, huedat.sensors[id].name, '->', name);
			request.put('http://' + host + '/api/' + user + '/sensors/' + id, {form: JSON.stringify({name: name})}, function (err, res, body) { cb(null, true); });
		}, function (err, result) {
			async.everySeries(Object.keys(huedat.rules), function (id, cb) {
				console.log('RULE   DELETE', huedat.rules[id].name + ' (' + id + ')');
				request.delete('http://' + host + '/api/' + user + '/rules/' + id, function (err, res, body) { cb(null, true); });
			}, function (err, result) {
				async.everySeries(Object.keys(config.links), function (link_source, cb) {
					if (!sensors_map[link_source]) {
						console.log('Sensor ID for ' + link_source + ' not found');
						return cb(null, true);
					}
					var link_source_id = sensors_map[link_source];
					async.everySeries(Object.keys(config.links[link_source]), function (link_destination, cb) {
						if (!lights_map[link_destination]) {
							console.log('Light ID for ' + link_destination + ' not found');
							return cb(null, true);
						}
						var link_destination_id = lights_map[link_destination];
						async.everySeries(config.links[link_source][link_destination], function (rule_id, cb) {
							if (!config.rules[rule_id]) {
								return cb(null, true);
							}
							console.log('RULE   CREATE', link_source_id + '->' + link_destination_id + '=' + rule_id + ' (' + link_source + '->' + link_destination + '=' + rule_id + ')');
							request.post('http://' + host + '/api/' + user + '/rules/', {form: JSON.stringify(config.rules[rule_id]).replace(/{{SENSOR_ID}}/g, link_source_id).replace(/{{LIGHT_ID}}/g, link_destination_id).replace(/{{RULE_ID}}/g, rule_id)}, function (err, res, body) { console.log(body); cb(null, true); });
						}, function (err, result) {
							cb(null, true);
						});
					}, function (err, result) {
						cb(null, true);
					});
				}, function (err, result) {
				});
			});
		});
	});
});