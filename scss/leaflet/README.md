This SCCS config has been done by hand, from original leaflet CSS files, and CSS of plugins used in Cesium.
 
Hox to update this config:
 - Execute 'bower install' to get dependencies (into www/lib)
 - Search leaflet lib (in 'www/lib')
 - Copy all source CSS file into current directory
 - Rename CSS files into '_<basename>.scss'
 - Copy all images resources into current 'images' directory
  
make sure to update the file 'leaflet.app.scss' (e.g. when adding some Leaflet plugins)
