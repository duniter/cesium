window.addEventListener('message', function(event) {
  console.log('[HTTPS frame] ', event);
  alert('Received ' + event);
});


alert('get ready !');
