@import "lib/MochaJSDelegate.js"

// Load a Cocoa framework
function loadFramework(context, frameworkName) {
    var plugin = context.plugin;
    var resource = frameworkName + ".framework";
    var folder = [[[plugin urlForResourceNamed:resource] path] stringByDeletingLastPathComponent];
    if (folder) {
        addFrameworkSearchPath(folder);
        framework(frameworkName);
    }
}

// Export to JSON
function exportStringsToJson(data, pathUrl) {
    // Create json
    var jsonData = [NSJSONSerialization dataWithJSONObject:data options:NSJSONWritingPrettyPrinted error:null];        
    var json = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding]; // NSData's writeToFile doesn't work in Mocha so we're using NSString's

    // Add Smartling directives
    var directives = '{\n\
  "smartling": {\n\
    "translate_paths": {\n\
      "path": "/*",\n\
      "key": "{*}",\n\
      "string_format_paths": "html: *"\n\
    }\n\
  },';
    json = [NSString stringWithFormat:"%@%@", directives, [json substringFromIndex:1]];

    // Export to file
    [json writeToURL:pathUrl atomically:true encoding:NSUTF8StringEncoding error:null];
}

function openSavePanel() {
    // File extension popup
    var popup = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(0, 0, 300, 30) pullsDown:false];
    popup.autoenablesItems = false;
    [popup addItemsWithTitles:["JSON"]];

    var types = ["xlf", "json", "strings"];

    // Prompt user for save location
    var savePanel = [NSSavePanel savePanel];
    savePanel.nameFieldStringValue = "export";
    savePanel.allowsOtherFileTypes = false;
    savePanel.accessoryView = popup;
    savePanel.extensionHidden = true;
    var result = [savePanel runModal];

    if (result == NSFileHandlingPanelOKButton) {
        var selectedExt = [popup indexOfSelectedItem];
        var extension = types[selectedExt];
        return [[savePanel URL] URLByAppendingPathExtension:extension];
    }
    return null;
}

// Export to Xliff
function exportStringsToXliff(data, pathUrl) {
    // Create xlf
    var header = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<xliff version=\"1.2\" xmlns=\"urn:oasis:names:tc:xliff:document:1.2\" xsi:schemaLocation=\"urn:oasis:names:tc:xliff:document:1.2 xliff-core-1.2-strict.xsd\">\n<file original=\"smartling_offline_cat_data.xliff\" source-language=\"en-US\" target-language=\" \" datatype=\"plaintext\">\n<header>\n</header>\n<body>\n\n";
    var footer = "</body>\n</file>\n</xliff>";

    var body = [NSMutableString string];
    for (var key in data) {
        var value = data[key].replace(/(?:\r\n|\r|\n)/g, '\\n');
        [body appendString:[NSString stringWithFormat:"<trans-unit resname=\"%@\">\n<source>%@</source>\n<target></target>\n</trans-unit>\n\n", key, value]];
    }

    // Export to file
    var fileContents = [NSString stringWithFormat:"%@%@%@", header, body, footer];
    [fileContents writeToURL:pathUrl atomically:true encoding:NSUTF8StringEncoding error:null];
}

// Export to .strings file
function exportStringsToFile(data, fileUrl) {
    var output = '';
    for (var key in data) {
    	var value = data[key].replace(/(?:\r\n|\r|\n)/g, '\\n');
    	var output = output + '"' + key + '" = "' + value + '";\n';
    }
    var result = [[[NSString alloc] initWithString:output] writeToURL:fileUrl atomically:true encoding:NSUTF8StringEncoding error:null];
    return result;
}

function openXliff(context) {
    var openPanel = [NSOpenPanel openPanel];
    openPanel.canChooseFiles = true;
    openPanel.canChooseDirectories = false;
    openPanel.allowsMultipleSelection = false;
    openPanel.allowedFileTypes = ["json"];

    var result = [openPanel runModal];
    if (result == NSFileHandlingPanelOKButton && [[openPanel URLs] count] > 0) {
        var pathUrl = [[openPanel URLs] objectAtIndex:0];
        var fileData = [NSData dataWithContentsOfURL:pathUrl];

        loadFramework(context, "Sketch");
        return [Smartling parseXliffData:fileData];
    }
}

// Duplicate selected page (using legacy api because [page copy] doesn't work in the new one)
function duplicateCurrentPage(context, suffix) {
    var doc = context.document;
    var page = doc.currentPage();
    var translatedPage = [page copy];
    translatedPage.pageDelegate = page.pageDelegate;
    translatedPage.setName(page.name() + suffix);   
    [[doc documentData] addPage:translatedPage];
    [doc setCurrentPage:translatedPage];
}

function getPageContentBounds(context) {
    var doc = context.document;
    var page = doc.currentPage();
    return  [page contentBounds];    
}

function isEmptyObject(object) {
    var empty = true;
    for (var key in object) {
        empty = false;
        break;
    }
    return empty;
}

function removeObjectDuplicates(object) {
    var values = [];
    var result = {};
    for (var key in object) {
        if (values.indexOf(object[key]) == -1) {
            values.push(object[key]);
            result[key] = object[key];
        }
    }
    return result;
}
