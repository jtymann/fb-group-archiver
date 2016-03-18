var graph = require('fbgraph');
var Q = require('Q');
var request = require('request');
var _ = require('underscore');
var fs = require('fs');

var postFields = [
	'id',
	'admin_creator',
	'application',
	'call_to_action',
	'caption',
	'created_time',
	'description',
	'feed_targeting',
	'from',
	'full_picture',
	'icon',
	'is_hidden',
	'is_published',
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

var likeFields = [
];

var commentFields = [
	'id',
	'attachment',
	'comment_count',
	'created_time',
	'from',
	'like_count',
	'message',
	'message_tags',
	'object',
	'parent',
	'user_likes'
];

var fbtool = {

	setAccessToken: function(group){
		var promise = function(resolve, reject, notify){
			graph.setAccessToken(group.token);
			resolve(group.token);
		};
		return Q.Promise(promise);
	},

	getOldestPost: function(group){
		var promise = function(resolve, reject, notify){
			console.log("Beginning scan for oldest post.");
			var oldest = false;

			var search = function(url, callback){
				process.stdout.write("#");
				graph.get(url, function(err, res){
					if(err){
						console.log("Error getting oldest post.", err);
						reject(err);
					}else if(res.paging && res.paging.next){
						oldest = res.paging.next;
						search(res.paging.next);
					}else{
						oldest = oldest.split("until=")[1];
						console.log('\nOldest post found, it was created at ' + oldest + '.');
						group.until = oldest;
						resolve(oldest);
					}
				});
			}

			search(group.id + '/feed?limit=500&fields=["id"]');
		}

		return Q.Promise(promise);
	},

	fetchPosts: function(group){
		var promise = function(resolve, reject, notify){
			console.log('Fetching new posts for group: ' + group.id);
			var newPosts = 0;

			if(!group.data){
				group.data = {};
			}

			if(!group.data.posts){
				group.data.posts = [];
			}

			var search = function(url){
				process.stdout.write("#");
				graph.get(url, function(err, res){
					if(res.paging){
						//Iterate through any new posts, and add them to the data
						var x=-1;
						var itr = function(){
							x++;
							if(x >= res.data.length){
								search(res.paging.previous);
							} else {
								var existing = _.find(group.data.posts, function(el){
									return el.id == res.data[x].id;
								});

								if(!existing){
									newPosts++;
									var post = res.data[x];									
									group.data.posts.push(post);
								}
								itr();
							}
						}

						itr();
					}else{
						console.log('\nFinished saving new posts for group: ' + group.id + '. ' + newPosts + ' new posts found.');
						resolve(group);
					}

				});
			};

			search(group.id + '/feed?limit=100&until=' + group.until + '&fields=' + JSON.stringify(postFields));
		}
		return Q.Promise(promise);
	},

	//fetches the comments, likes, photos, and videos for a given fbobj
	fetchPostAttributes: function(post, index, group){
		var download = this.download;
		var instance = this;
		var promise = Q.when();

		if(post.full_picture){
			Q.fcall(download(post.full_picture, 'www/groups/'+group.id+'/images/post_' + post.id + '_full_picture.png'));
			post.full_picture_local = 'post_' + post.id + '_full_picture.png';
		}

		if(post.picture){
			Q.fcall(download(post.picture, 'www/groups/'+group.id+'/images/post_' + post.id + '_picture.png'));
			post.picture_local = 'post_' + post.id + '__picture.png';
		}

		if(post.type == 'video'){
			if(post.source.indexOf('fbcdn.net') != -1){
				Q.fcall(download(post.source, 'www/groups/'+group.id+'/images/post_' + post.id + '_source.mp4'));
				post.picture_local = 'post_' + post.id + '__source.mp4';
			}
		}

		promise = promise.then(function(){
			return instance.getAllLikes(post);
		});

		promise = promise.then(function(){
			if(group.data.likeNameCache == undefined){
				group.data.likeNameCache = [];
			}
			return instance.updateLikeCache(post.likes, group.data.likeNameCache);
		});

		promise = promise.then(function(){
			return instance.getAllComments(post);
		});

		return promise;
	},

	//fetches the comments, likes, photos, and videos for a given fbobj
	fetchCommentAttributes: function(comment, cindex, group){
		var download = this.download;
		var instance = this;
		var promise = Q.when();

		if(comment.attachment && comment.attachment.media && comment.attachment.media.image){
			Q.fcall(download(comment.attachment.media.image.src, 'www/groups/'+group.id+'/images/comment_' + comment.id + '_picture.jpg'));
			comment.picture_local = 'comment_' + comment.id + '_picture.jpg';
		}

		promise = promise.then(function(){
			return instance.getAllLikes(comment);
		});

		promise = promise.then(function(){
			if(group.data.likeNameCache == undefined){
				group.data.likeNameCache = [];
			}
			return instance.updateLikeCache(comment.likes, group.data.likeNameCache);
		});

		promise = promise.then(function(){
			return instance.getAllComments(comment);
		});

		return promise;
	},

	getAllLikes: function(object){
		if(object.likes == undefined){
			object.likes = [];
		} 

		var promise = function(resolve, reject, notify){
			var fetch = function(next){
				process.stdout.write("#");
				graph.get(next, function(err, res){
					if(err){
						console.log('Error fetching likes for object ' + object.id);
						reject(err);
					} else {
						object.likes = object.likes.concat(res.data);

						if(res.paging && res.paging.next){
							fetch(res.paging.next);
						} else {
							resolve();
						}
					}
				});
			};
			fetch('/' + object.id + '/likes');
		}
		return Q.Promise(promise);
	},

	getAllComments: function(object){
		if(object.comments == undefined){
			object.comments = [];
		} 

		var promise = function(resolve, reject, notify){
			var fetch = function(next){
				process.stdout.write("@");
				graph.get(next, function(err, res){
					if(err){
						reject(err);
					} else {
						object.comments = object.comments.concat(res.data);

						if(res.paging && res.paging.next){
							fetch(res.paging.next);
						} else {
							resolve();
						}
					}
				});
			};
			fetch('/' + object.id + '/comments?fields=' + JSON.stringify(commentFields));
		}
		return Q.Promise(promise);
	},

	updateLikeCache: function(likes, cache){
		var promise = function(resolve, reject, notify){
			var x=-1;
			var itr = function(){
				x++;
				if(x >= likes.length){
					resolve();
				} else {
					var id = likes[x].id;
					var existing = _.find(cache, function(el){
						return el.id == id;
					});

					if(existing){
						itr();
					} else {
						graph.get(id, function(err, res){
							if(err){
								reject(err);
							} else {
								cache.push(res);
								itr();
							}
						});
					}
				}
			}
			itr();
		}
		return Q.Promise(promise);
	},

	download: function(uri, filename){
		var promise = function(resolve, reject, notify){
			request.head(uri, function(err, res, body){
				process.stdout.write("%");
				request(uri).pipe(fs.createWriteStream(filename)).on('close', resolve).on('error', function(err){
					console.log('Error saving photo.');
					console.log(err);
				});
			});
		}
		return Q.Promise(promise);
	},
}

module.exports = fbtool;
