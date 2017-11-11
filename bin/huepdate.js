#!/usr/bin/env node

'use strict';

var host = '';
var user = '';

var fs = require('fs');
var request = require('request');
var async = require('async');

var config = require('../config/huepdate.json');

var lights_map = {};
var sensors_map = {};
var groups_map = {};

var find_key_in_array = function (haystack, needle) {
	for (var key in haystack) {
		var value = haystack[key];
		if (needle.substr(0, value.length) === value) {
			return value;
		}
	}
};

var steps = [
	function (huedat, cb) {
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
		}, cb);
	},
	function (huedat, cb) {
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
		}, cb);
	},
	function (huedat, cb) {
		async.everySeries(Object.keys(huedat.rules), function (id, cb) {
			console.log('RULE   DELETE', huedat.rules[id].name + ' (' + id + ')');
			request.delete('http://' + host + '/api/' + user + '/rules/' + id, function (err, res, body) { cb(null, true); });
		}, cb);
	},
	function (huedat, cb) {
		async.everySeries(Object.keys(huedat.resourcelinks), function (id, cb) {
			console.log('RLINK  DELETE', huedat.resourcelinks[id].name + ' (' + id + ')');
			request.delete('http://' + host + '/api/' + user + '/resourcelinks/' + id, function (err, res, body) { cb(null, true); });
		}, cb);
	},
	function (huedat, cb) {
		async.everySeries(Object.keys(huedat.schedules), function (id, cb) {
			console.log('SCHED  DELETE', huedat.schedules[id].name + ' (' + id + ')');
			request.delete('http://' + host + '/api/' + user + '/schedules/' + id, function (err, res, body) { cb(null, true); });
		}, cb);
	},
	function (huedat, cb) {
		async.everySeries(Object.keys(huedat.groups), function (id, cb) {
			console.log('GROUP  DELETE', huedat.groups[id].name + ' (' + id + ')');
			request.delete('http://' + host + '/api/' + user + '/groups/' + id, function (err, res, body) { cb(null, true); });
		}, cb);
	},
	function (huedat, cb) {
		async.everySeries(Object.keys(config.groups), function (groupname, cb) {
			console.log('GROUP  CREATE', groupname, config.groups[groupname].length);
			var lights = [];
			config.groups[groupname].forEach(function (light) {
				lights.push(lights_map[light]);
			});
			request.post('http://' + host + '/api/' + user + '/groups/', {
				form: JSON.stringify({
					name: groupname,
					lights: lights,
					type: 'Room',
					class: 'Other'
				})
			}, function (err, res, body) {
				if (err) {
					return cb(err, false);
				}
				console.log(body);
				var id = JSON.parse(body)[0].success.id;
				groups_map[groupname] = id;
				cb(null, true);
			});
		}, cb);
	},
	function (huedat, cb) {
		async.everySeries(Object.keys(config.links), function (link_source, cb) {
			if (!sensors_map[link_source]) {
				console.log('Sensor ID for ' + link_source + ' not found');
				return cb(null, true);
			}
			var link_source_id = sensors_map[link_source];
			async.everySeries(Object.keys(config.links[link_source]), function (link_destination, cb) {
				if (!groups_map[link_destination]) {
					console.log('Group ID for ' + link_destination + ' not found');
					return cb(null, true);
				}
				var link_destination_id = groups_map[link_destination];
				async.everySeries(config.links[link_source][link_destination], function (rule_id, cb) {
					if (!config.rules[rule_id]) {
						return cb(null, true);
					}
					console.log('RULE   CREATE', link_source_id + '->' + link_destination_id + '=' + rule_id + ' (' + link_source + '->' + link_destination + '=' + rule_id + ')');
					request.post('http://' + host + '/api/' + user + '/rules/', {
						form: JSON.stringify(config.rules[rule_id]).replace(/{{SENSOR_ID}}/g, link_source_id).replace(/{{GROUP_ID}}/g, link_destination_id).replace(/{{RULE_ID}}/g, rule_id)
					}, function (err, res, body) {
						console.log(body);
						cb(null, true);
					});
				}, function (err, result) {
					cb(null, true);
				});
			}, function (err, result) {
				cb(null, true);
			});
		}, cb);
	},
];


request('http://' + host + '/api/' + user, function (err, res, body) {
	if (err) {
		throw err;
	}
	var huedat = JSON.parse(body);
	async.everySeries(steps, function (step, cb) {
		console.log('Executing next step...');
		step(huedat, cb);
	}, function (err, result) {
		console.log('All steps executed');
	});
});