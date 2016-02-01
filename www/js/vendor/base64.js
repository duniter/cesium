/*
 * #%L
 * uCoinj :: UI Wicket
 * %%
 * Copyright (C) 2014 - 2016 EIS
 * %%
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as
 * published by the Free Software Foundation, either version 3 of the 
 * License, or (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public 
 * License along with this program.  If not, see
 * <http://www.gnu.org/licenses/gpl-3.0.html>.
 * #L%
 */
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
