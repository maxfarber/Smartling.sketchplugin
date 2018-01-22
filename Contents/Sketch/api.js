@import "util.js"

////////////////
// Menu items //
////////////////

function logout(context) {
    loadFramework(context, "Sketch");

    // clear saved token
    [Smartling logOut];
}

function support(context) {
	// show support page
	var url = [NSURL URLWithString:"http://help.smartling.com/knowledge-base/"];
	var browserBundleIdentifier = "com.apple.Safari";

	[[NSWorkspace sharedWorkspace] openURLs:[url] withAppBundleIdentifier:browserBundleIdentifier options:null additionalEventParamDescriptor:null launchIdentifiers:null]
}

/////////////
// Private //
/////////////
