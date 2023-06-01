
// Workaround to add "".startsWith() if not present
if (typeof String.prototype.startsWith !== 'function') {
  console.debug("Adding String.prototype.startsWith() -> was missing on this platform");
  String.prototype.startsWith = function(prefix, position) {
    return this.indexOf(prefix, position) === 0;
  };
}

// Workaround to add "".startsWith() if not present
if (typeof String.prototype.trim !== 'function') {
  console.debug("Adding String.prototype.trim() -> was missing on this platform");
  // Make sure we trim BOM and NBSP
  var rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;
  String.prototype.trim = function() {
    return this.replace(rtrim, '');
  };
}

// Workaround to add Math.trunc() if not present - fix #144
if (Math && typeof Math.trunc !== 'function') {
  console.debug("Adding Math.trunc() -> was missing on this platform");
  Math.trunc = function(number) {
    return parseInt((number - 0.5).toFixed());
  };
}

// Workaround to add "".format() if not present
if (typeof String.prototype.format !== 'function') {
  console.debug("Adding String.prototype.format() -> was missing on this platform");
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) {
      return typeof args[number] != 'undefined' ? args[number] : match;
    });
  };
}

// Workaround to add "".endsWith() if not present
if (typeof String.prototype.startsWith !== 'function') {
  console.debug("Adding String.prototype.endsWith() -> was missing on this platform");
  String.prototype.startsWith = function() {
    var args = arguments;
    return this.indexOf(args[0]) === 0;
  };
}

// Workaround to add "".endsWith() if not present
if (typeof String.prototype.endsWith !== 'function') {
  console.debug("Adding String.prototype.endsWith() -> was missing on this platform");
  String.prototype.endsWith = function() {
    var args = arguments;
    return this.lastIndexOf(args[0]) === this.length - 1;
  };
}
