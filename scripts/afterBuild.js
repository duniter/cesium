module.exports = function(ctx) {
    // make sure android platform is part of build
    if (ctx.opts.platforms.indexOf('android') < 0) {
        return;
    }
    var fs = ctx.requireCordovaModule('fs'),
        path = ctx.requireCordovaModule('path'),
        deferral = ctx.requireCordovaModule('q').defer();

    var platformRoot = path.join(ctx.opts.projectRoot, 'platforms/android');
    var apkFileLocation = path.join(platformRoot, 'build/outputs/apk/android-debug.apk');

    fs.stat(apkFileLocation, function(err,stats) {
        if (err) {
                deferral.reject('Operation failed');
        } else {
            console.log('Size of ' + apkFileLocation + ' is ' + stats.size +' bytes');
            deferral.resolve();
        }
    });

    return deferral.promise;
};
