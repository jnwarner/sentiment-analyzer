'use strict';

const express = require('express'),
	app = express();
const path = require('path');
const ip = require('ip');
const stream = require('./modules/stream');
const tokens = require('./tokens.json');

app.use(express.static(path.join(__dirname, '/resources')));

app.set('view engine', 'pug');
app.set('views', 'views');

app.get('/', (req, res) => {
	let usernames = [];
	for (let i = 0; i < stream.dataObj.profiles.length; i++) {
		usernames.push(stream.dataObj.profiles[i].screen_name);
	}

	let topPositive = stream.dataObj.profiles.sort((a, b) => {
		return b.score - a.score;
	}).slice(0, 3);

	let topNegative = stream.dataObj.profiles.sort((a, b) => {
		return a.score - b.score;
	}).slice(0, 3);

	let profiles = shuffle(stream.dataObj.profiles).slice(0, tokens.NUM_CARDS);

	let num_users = stream.dataObj.profiles.length;

	res.render('index', {
		users: usernames,
		positive: topPositive,
		negative: topNegative,
		profiles: profiles,
		filter: tokens.FILTER,
		num_users: num_users
	});
});

app.get('/about', (req, res) => {
	let num_users = stream.dataObj.profiles.length;

	let usernames = [];
	for (let i = 0; i < stream.dataObj.profiles.length; i++) {
		usernames.push(stream.dataObj.profiles[i].screen_name);
	}

	res.render('about', {
		users: usernames,
		num_users: num_users,
		filter: tokens.FILTER
	});
});

app.get('/404', (req, res) => {
	res.render('error');
});

app.get('/:screen_name', (req, res) => {
	let username = req.params.screen_name;
	if (!username) {
		res.redirect('/404');
	}
	let userIndex = stream.dataObj.profiles.map(function (e) { return e.screen_name; }).indexOf(username);

	if (userIndex > -1) {
		let usernames = [];
		for (let i = 0; i < stream.dataObj.profiles.length; i++) {
			usernames.push(stream.dataObj.profiles[i].screen_name);
		}

		// user exists, get object and render user file
		let user = stream.dataObj.profiles[userIndex];

		let words = [];
		let values = [];
		for (let i = 0; i < user.positive_words.length; i++) {
			words.push(user.positive_words[i].word);
			values.push(user.positive_words[i].value);
		}
		for (let i = 0; i < user.negative_words.length; i++) {
			words.push(user.negative_words[i].word);
			values.push(user.negative_words[i].value);
		}

		res.render('user', {
			users: usernames,
			user: user,
			words: words,
			values: values
		});
	} else {
		res.redirect('/404');
	}
});

app.get('*', (req, res) => {
	res.redirect('/404');
});

const server = app.listen(3000, () => {
	console.log(`Listening at ${ip.address()}:${server.address().port}`);
	stream.getTweets(tokens.FILTER);
});

function shuffle(a) {
	let j, x, i;
	for (i = a.length - 1; i > 0; i--) {
		j = Math.floor(Math.random() * (i + 1));
		x = a[i];
		a[i] = a[j];
		a[j] = x;
	}
	return a;
}