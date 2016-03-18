var argv = require('minimist')(process.argv.slice(2));
var fs = require('fs');
var util = require('util');
var config = require('./config.js');
var rmdir = require('rimraf');
var _ = require('underscore');
var request = require('request');
var graph = require('fbgraph');
var fbtool = require('./fbtool.js');
var Q = require('Q');

if(argv._.length == 1 && argv._[0].toLowerCase() == 'add'){
	var id = argv.i;
	var token = argv.a;

	if(id && token){
		try{
			fs.mkdirSync('www/groups');
		}catch(error){} //Error just means it exists, so squelch it. If we can't create it, we will encounter write errors elsewhere.

		try{
			fs.mkdirSync('www/groups/'+id);

			var filedata = {
				'id': id,
				'token': token
			};
			fs.appendFileSync('www/groups/'+id+'/group.json', JSON.stringify(filedata));

			console.log("Added new group.");
		}catch(error){
			console.log('Error: Group with id ' + id + ' already exists.');
		}

	}else{
		usage();
	}
}else if(argv._.length == 1 && argv._[0].toLowerCase() == 'remove'){
	var id = argv.i;

	if(id){

		try{
			rmdir.sync('www/groups/'+id);
			console.log("Group deleted.");
		}catch(error){
		}

	}else{
		usage();
	}
}else if(argv._.length == 1 && argv._[0].toLowerCase() == 'update'){
	var id = argv.i;

	if(id){
		var group = JSON.parse(fs.readFileSync('www/groups/'+id+'/group.json', 'utf8'));
		var dataString = '{}';

		try{
			fs.readFileSync('www/groups/'+group.id+'/data.json', 'utf8');
		} catch(error) {

		}

		archiveGroupData(group);
	}else{
		usage();
	}
}else{
	usage();
}

function archiveGroupData(group){
	Q.when()
	.then(
		function(){ return fbtool.setAccessToken(group); }
	).then(
		//Fetch oldest post
		function(){ return fbtool.getOldestPost(group); }
	).then(
		//Fetch all posts
		function(){ return fbtool.fetchPosts(group); }
	).then(
		function(){
			console.log('Querying each post for additional post data (Comments, Likes, Photos, etc)');

			try{
				fs.mkdirSync('www/groups/'+group.id+'/images');
			}catch(error){} //Error just means it exists, so squelch it. If we can't create it, we will encounter write errors elsewhere.

			var chain = Q.when();
			_.forEach(group.data.posts, function(el, i, a){
				chain = chain.then( function(){ return fbtool.fetchPostAttributes(el, i, group); } );
			});
			chain = chain.then(function(){
				return Q.Promise(function(resolve){
					console.log('\nFinished Querying for additional post data.');
					resolve();
				});
			});
			return chain;
		}
	).then(
		function(){
			console.log('Querying each comment for additional comment data (Replies, Likes, Photos, etc)');

			var chain = Q.when();
			_.forEach(group.data.posts, function(post, pindex, parray){
				_.forEach(post.comments, function(comment, cindex, carray){
					chain = chain.then( function(){ return fbtool.fetchCommentAttributes(comment, cindex, group); } );
				});
			});
			chain = chain.then(function(){
				return Q.Promise(function(resolve){
					console.log('\nFinished Querying for additional comment data.');
					resolve();
				});
			});
			return chain;
		}
	).then(
		function(){
			console.log('Querying each reply for additional reply data (Likes, Photos, etc)');

			var chain = Q.when();
			_.forEach(group.data.posts, function(post, pindex, parray){
				_.forEach(post.comments, function(comment, cindex, carray){
					_.forEach(comment.comments, function(reply, rindex, rarray){
						chain = chain.then( function(){ return fbtool.fetchCommentAttributes(reply, rindex, group); } );
					});
				});
			});
			chain = chain.then(function(){
				return Q.Promise(function(resolve){
					console.log('\nFinished Querying for additional reply data.');
					resolve();
				});
			});
			return chain;
		}
	).then(
		function(){ 
			var promise = function(resolve, reject, notify){
				saveGroupData(group);
				console.log("Finished Archiving");
				resolve();
			}
			return Q.Promise(promise);
		}
	);
}

function saveGroupData(group){
	var fd = fs.openSync('www/groups/'+group.id+'/data.json', 'w');
	fs.writeSync(fd,JSON.stringify(group.data));
	fs.closeSync(fd);
}

function getAllComments(post, callback){
	if(post.comments == undefined){
		post.comments = [];
		callback(post);
	} else {
		var pagination = post.comments.paging;
		var comment_data = post.comments.data;
		post.comments = comment_data;

		var fetch = function(next){
			graph.get(next, function(err, res){
					if(err){
						callback(post, err);
					} else {
						comment_data = comment_data.concat(res.data);
						post.comments = comment_data;

						if(res.paging.next){
							fetch(res.paging.next);
						} else {
							callback(post);
						}
					}
			});
		};

		if(pagination.next){
			fetch(pagination.next);
		} else {
			callback(post);
		}
	}
}

function usage(){
	console.log('usage: fb-archiver.js command [options]');
	console.log('  commands:');
	console.log('    add:    Adds a new facebook group to the list of tracked facebook');
	console.log('            groups. Requires -i, and -a options.');
	console.log('    remove: Removes a facebook group to the list of tracked facebook');
	console.log('            groups. Requires either the -i options.');
	console.log('    update: Downloads any new posts to the group archive for one or ');
	console.log('            all groups. If -i is specified, only that one ');
	console.log('            group is updated. Otherwise all groups are updated.');
	console.log('');
	console.log('  options:');
	console.log('    -i: The facebook group id.');
	console.log('    -a: An access token that has access to the facebook group.');
}
