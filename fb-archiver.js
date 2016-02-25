var argv = require('minimist')(process.argv.slice(2));
var fs = require('fs');
var util = require('util');
var config = require('./config.js');
var rmdir = require('rimraf');
var graph = require('fbgraph');
var _ = require('underscore');
var request = require('request');

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
		var dataString = fs.readFileSync('www/groups/'+group.id+'/data.json', 'utf8');
		graph.setAccessToken(group.token);
		group.data = {};
		if(dataString){
			group.data = JSON.parse(dataString);
		}

		if(!group.data.until){
			getOldestPost(group, function(oldest){
				if(oldest){
					group.data.until = oldest;
					fetchPosts(group,saveGroupData);
				}else{
					console.log("Error: Failed to find the oldest group post.");
				}
			});
		}else{
			fetchPosts(group,saveGroupData);
		}

		/**/

	}else{
		usage();
	}
}else{
	usage();
}

function saveGroupData(group){
	var fd = fs.openSync('www/groups/'+group.id+'/data.json', 'w');
	fs.writeSync(fd,JSON.stringify(group.data));
	fs.closeSync(fd);
}

function fetchPosts(group, callback){
	console.log('Fetching new posts for group: ' + group.id);

	var postFields = [
		'id',
		'admin_creator',
		'application',
		'call_to_action',
		'caption',
		'created_time',
		'comments',
		'description',
		'feed_targeting',
		'from',
		'full_picture',
		'icon',
		'is_hidden',
		'is_published',
		'likes',
		'link',
		'message',
		'message_tags',
		'name',
		'object_id',
		'picture',
		'place',
		'privacy',
		'properties',
		'shares',
		'source',
		'status_type',
		'story',
		'story_tags',
		'targeting',
		'to',
		'type',
		'updated_time',
		'with_tags'
	];

	if(!group.posts){
		group.data.posts = [];
	}

	var newPosts = 0;

	var search = function(url){
		process.stdout.write("#");
		graph.get(url, function(err, res){
			if(res.paging){
				//Iterate through any new posts, and add them to the data
				for(var x=0; x<res.data.length; x++){
					var existing = _.find(group.data.posts, function(el){
						return el.id == res.data[x].id;
					});
					if(!existing){
						newPosts++;
						var post = saveContent(group, res.data[x]);
						group.data.posts.push(post);
					}
				}

				//Grab the new until index and save that

				search(res.paging.previous);
			}else{
				console.log('\nFinished saving new posts for group: ' + group.id + '. ' + newPosts + ' new posts found.');
				callback(group);
			}

		});
	}

	search(group.id + '/feed?limit=100&until=' + group.data.until + '&fields=' + JSON.stringify(postFields));
}

function saveContent(group, post){
	try{
		fs.mkdirSync('www/groups/'+group.id+'/images');
	}catch(error){} //Error just means it exists, so squelch it. If we can't create it, we will encounter write errors elsewhere.

	if(post.full_picture){
		download(post.full_picture, 'www/groups/'+group.id+'/images/post_' + post.id + '_full_picture.png', function(){
		  process.stdout.write("#");
		});
		post.full_picture_local = 'post_' + post.id + '_full_picture.png';
	}

	if(post.picture){
		download(post.picture, 'www/groups/'+group.id+'/images/post_' + post.id + '_picture.png', function(){
		  process.stdout.write("#");
		});
		post.picture_local = 'post_' + post.id + '__picture.png';
	}

	return post;
}

var download = function(uri, filename, callback){
  request.head(uri, function(err, res, body){
    request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
  });
};

function getOldestPost(group, callback){
	console.log("Beginning scan for oldest post.");
	var oldest = false;

	var base = function(oldest){
		if(oldest){
			console.log('Oldest post found, it was created at ' + oldest + '.');
		}
		if(callback){
			callback(oldest);
		}
	}

	var search = function(url, callback){
		graph.get(url, function(err, res){
			if(res.paging && res.paging.next){
				oldest = res.paging.next;
				setTimeout(function(){
					search(res.paging.next);
				}, 1000);
			}else{

				oldest = oldest.split("until=")[1];
				base(oldest);
			}
		});
	}

	search(group.id + '/feed?limit=500&fields=["id"]');

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
