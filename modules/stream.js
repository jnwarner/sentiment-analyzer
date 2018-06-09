'use strict';

const fs = require('fs');
const twitter = require('twitter');
const sentiment = require('sentiment');
const tokens = require('../tokens.json');
const userTimeline = 'statuses/user_timeline';

let streamModule = {};

fs.readFile('data.json', (err, data) => {
	if (err) {
		throw new Error(err);
	} else {
		// initialize objects used
		streamModule.dataObj = JSON.parse(data);
		streamModule.rate_limited = false;
		streamModule.changes_made = false;
	}
});

let client = new twitter({
	consumer_key: tokens.C_KEY,
	consumer_secret: tokens.C_SECRET,
	access_token_key: tokens.A_TOKEN,
	access_token_secret: tokens.A_TOKEN_SECRET
});


streamModule.getTweets = (filter) => {
	if (!filter) {
		throw new Error('NoFilter');
	}

	console.log(`Attempting to start listener on filter ${filter}`);
	client.stream('statuses/filter', { track: filter }, (stream) => {
		stream.on('data', (event) => {
			if (!streamModule.rate_limited) {
				let userInfo = {
					name: event.user.name,
					screen_name: event.user.screen_name,
					description: event.user.description,
					verified: event.user.verified,
					id: event.user.id,
					profile_url: `http://twitter.com/${event.user.screen_name}`,
					profile_image_url: event.user.profile_image_url,
					profile_banner_url: event.user.profile_banner_url,
					profile_color: hexToRgb(event.user.profile_link_color),
					score: '',
					comp_score: '',
					positive_tweets: 0,
					negative_tweets: 0,
					neutral_tweets: 0,
					positive_avg: 0,
					negative_avg: 0,
					tweets_scored: 0,
					tweets_collected: 0,
					lowest_scored: {},
					highest_scored: {},
					positive_words: [],
					negative_words: []
				};

				streamModule.getUser(userInfo, (success) => {
					if (!success) {
						return streamModule.rate_limited = true;
					} else {
						if (!streamModule.changes_made) {
							streamModule.changes_made = true;
						}
					}
				});
			}
		});

		stream.on('error', (error) => {
			if (error.toString().includes('420')) {
				console.log('On cooldown, waiting and retrying...');
				return streamModule.rate_limited = true;
			}
		});
	});
};

streamModule.getUser = (userObj, callback) => {
	let success = true;

	client.get(userTimeline, { screen_name: userObj.screen_name, count: 200, include_rts: false }, (error, res) => {
		if (error || !res.length || res.length < 50) {
			if (error) {
				console.log(error);
				return callback(success = false);
			} else if (!res.length) {
				console.log('Response undefined');
				return;
			} else {
				console.log(`Rejecting ${userObj.screen_name}`);
				return;
			}
		}
		console.log(`${userObj.screen_name}: ${res.length} tweets`);
		let sentimentScore = 0;
		let compScore = 0;
		let scoredTweets = res.length;
		let positiveAvg = 0;
		let negativeAvg = 0;
		let highestSent = 0;
		let lowestSent = 0;
		for (let i = 0; i < res.length; i++) {
			let curSentiment = sentiment(res[i].text);
			sentimentScore += curSentiment.score;
			compScore += curSentiment.comparative;
			if (curSentiment.score > highestSent) {
				userObj.highest_scored = res[i];
			}
			if (curSentiment.score < lowestSent) {
				userObj.lowest_scored = res[i];
			}
			if (curSentiment.positive.length > 0) {
				positiveAvg += (curSentiment.positive.length / curSentiment.tokens.length);
				for (let j = 0; j < curSentiment.positive.length; j++) {
					userObj.positive_words.push(curSentiment.positive[j].toLowerCase());
				}
			}
			if (curSentiment.negative.length > 0) {
				negativeAvg += (curSentiment.negative.length / curSentiment.tokens.length);
				for (let j = 0; j < curSentiment.negative.length; j++) {
					userObj.negative_words.push(curSentiment.negative[j].toLowerCase());
				}
			}
			if (curSentiment.score === 0) {
				scoredTweets--;
			}
			if (curSentiment.score < 0) {
				userObj.negative_tweets++;
			} else if (curSentiment.score > 0) {
				userObj.positive_tweets++;
			} else {
				userObj.neutral_tweets++;
			}
		}

		userObj.score = sentimentScore / scoredTweets;
		userObj.comp_score = compScore / scoredTweets;
		userObj.positive_avg = positiveAvg / scoredTweets;
		userObj.negative_avg = negativeAvg / scoredTweets;
		userObj.tweets_scored = scoredTweets;
		userObj.tweets_collected = res.length;

		if (isNaN(userObj.score) || isNaN(userObj.comp_score) || isNaN(userObj.positive_avg) || isNaN(userObj.negative_avg) || scoredTweets < 25) {
			console.log(`Rejecting ${userObj.screen_name}`);
			return;
		}

		let positiveWords = [];
		for (let i = 0; i < userObj.positive_words.length; ++i) {
			let word = userObj.positive_words[i];
			let wordIndex = positiveWords.map((e) => {return e.word;}).indexOf(word);
			if (wordIndex > -1) {
				positiveWords[wordIndex].value++;
			} else {
				positiveWords.push({ word: word, value: 1 });
			}
		}

		let negativeWords = [];
		for (let i = 0; i < userObj.negative_words.length; ++i) {
			let word = userObj.negative_words[i];
			let wordIndex = negativeWords.map((e) => {return e.word;}).indexOf(word);
			if (wordIndex > -1) {
				negativeWords[wordIndex].value++;
			} else {
				negativeWords.push({ word: word, value: 1 });
			}
		}

		userObj.negative_words = negativeWords.sort((a, b) => {
			return b.value - a.value;
		}).slice(0, 3);

		userObj.positive_words = positiveWords.sort((a, b) => {
			return b.value - a.value;
		}).slice(0, 3);

		let imageURL = userObj.profile_image_url;

		imageURL = `${imageURL.substring(0, imageURL.lastIndexOf('_'))}${imageURL.substring(imageURL.lastIndexOf('.'), imageURL.length)}`;

		userObj.profile_image_url = imageURL;

		let userIndex = streamModule.dataObj.profiles.map(function (e) { return e.id; }).indexOf(userObj.id);

		if (userIndex > -1) {
			console.log(`Updating ${userObj.screen_name}`);
			streamModule.dataObj.profiles.splice(userIndex, 1);
		} else {
			console.log(`Adding ${userObj.screen_name}`);
		}

		streamModule.dataObj.profiles.unshift(userObj);

		callback(success);
	});
};

streamModule.removeProfile = (id) => {
	let userIndex = streamModule.dataObj.profiles.map(function (e) { return e.id; }).indexOf(id);

	if (userIndex > -1) {
		console.log(`Index found, removing profile for ${streamModule.dataObj.profiles[userIndex].name}`);
		streamModule.dataObj.profiles.splice(userIndex, 1);
	} else {
		console.log('User with ID does not exist');
	}
};

function hexToRgb(hex) {
	let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : null;
}

setInterval(() => {
	if (streamModule.rate_limited) {
		streamModule.rate_limited = false;
	}
	if (streamModule.changes_made) {
		streamModule.changes_made = false;
		fs.writeFile('data.json', JSON.stringify(streamModule.dataObj), (err) => {
			if (err) {
				throw new Error(err);
			}
			console.log('Writing to file');
		});
	}
}, 30000);

module.exports = streamModule;