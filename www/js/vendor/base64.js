(function() {
    var Base64 = (typeof module !== "undefined" && module !== null ? module.exports : void 0) || (window.Base64 = {});

    Base64.encode = (function(arr) {
      if (typeof btoa === 'undefined') {
        return (new Buffer(arr)).toString('base64');
      } else {
        var i, s = [], len = arr.length;
        for (i = 0; i < len; i++) s.push(String.fromCharCode(arr[i]));
        return btoa(s.join(''));
      }
    });

    Base64.decode = (function(s) {
        if (typeof atob === 'undefined') {
          return new Uint8Array(Array.prototype.slice.call(new Buffer(s, 'base64'), 0));
        } else {
          var i, d = atob(s), b = new Uint8Array(d.length);
          for (i = 0; i < d.length; i++) b[i] = d.charCodeAt(i);
          return b;
        }
    });

}).call(this);
