# Version v1.5.3

## All platforms

- [enh] My operations: show many pubkeys, when TX has more than one issuers (or recipients)
- [enh] My operations: Optimize load

- [fix] Home: fix logout button icons, on small device
- [fix] Menu: badge alignment on small device
- [fix] Wot identity: better fab compose id (UID is not safe)
- [fix] Secondary wallet: allow to see certifications
- [fix] Transfer: always hide the digitKeyboard when not a mobile device - fix #866
- [fix] Network: add button to show Cesium+ network (if expert mode and Cesium+ plugin are enable)

### Cesium+ plugin

- [enh] Cesium+: add a view to monitor Cesium+ pod network
- [enh] Cesium+ settings: Use the specific Cs+ network view, to select a Pod
- [enh] Cesium+ pod stats: Allow to see stats pages (data and synchro) from any Cesium+ pod

- [fix] Cesium+ settings: do not store remotely es.node.useSsl property
- [fix] Cesium+ page: Fix comment "send button" alignment
- [fix] Cesium+ pod stats: use the new index (document/stats) instead of (docstat/record)
- [fix] Settings: do not store `max upload size` in remote settings
- [fix] Network: Fix an error in console, when leaving the network view

### Android build

- [fix] Android: revert to minSdkVersion=19
- [fix] Android: Fix new cordova restore plugins
- [fix] Android build: use ~/Android/Sdk if exists
- [fix] Android build: add gradle installation when not found
- [fix] Android build: use existing gradle if found in the path

## Build tools

- [enh] Add a sha256 checksum file, on each release

- [fix] Remove Ionic v1 config file
- [fix] Fix gulp compile script (watch)
- [fix] update config.xml cordova plugins version
- [fix] Build: compile using the last ionic cli, and nodeJS v10
- [fix] Build: Remove unused gulp sourcemaps

