# Startup and maps repair

App launch: readable animated Da Publications mark, guest entry when necessary,
then Home. Home exposes Play, Join, Maps, Store and Settings. Saved matches are
resumed explicitly; their seats and state are retained. Browser room links keep
their direct join/return behaviour. Reduced Motion retains a readable static mark.

Maps has two independent choices: one of eleven supplied 3D worlds and one of six
city name editions. These must not be presented as six unique geometries when
only names change. New hosts carry their preferences into the lobby. The host can
change either there; other players see the shared choices. Maps lock at START.
Existing saves without a world keep Classic City. No economy changes.

Engine: optional GameState.world and pure SET_WORLD action, host/lobby only.
Unity: world identifier in the existing snapshot, bundled scene geometry and
materials for all available native themes 000–010. Preserve the verified Classic
City. Native parts retain assembly and UVs; only active world geometry is visible.

Acceptance: cold and saved-room launches both show the publisher/home flow;
Play/Maps/Store/Settings work on small landscape screens; Resume preserves the
seat. Every world is genuinely selectable and renders distinct geometry. Two
clients share the world, city and game state. A new APK is versioned and its
packaged player/files verified. No old package or saved match is erased.
