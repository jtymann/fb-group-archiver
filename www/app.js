'use strict';

angular.module('fbArchive', [])
  .run(function ($rootScope, $location, $window) {


  }).controller('MainController', function($scope, $location, $http) {
  	var groupId = window.location.search.split("=")[1];

  	$http({
	  method: 'GET',
	  url: 'groups/' + groupId + '/data.json'
	}).then(function successCallback(response) {
	    $scope.posts = response.data.posts;
	  }, function errorCallback(response) {
	    // called asynchronously if an error occurs
	    // or server returns response with an error status.
	  });

  });