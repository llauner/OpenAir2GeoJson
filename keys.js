var keys = JSON. parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);

exports.get = function () {
	return keys;
  };