@import "api.js"
@import "lib/pseudoloc.js"

////////////////
// Menu items //
////////////////

// Extracts all strings contained in a document into a file
function extractStrings(context) {
    var textLayers = getPageTextLayers(context);
    var strings = getStringsFromTextLayers(textLayers);
    var symbolTextLayers = getPageSymbolTextLayers(context);
    addStringsFromSymbolTextLayers(strings, symbolTextLayers);
    strings = removeObjectDuplicates(strings);

    loadFramework(context, "Sketch");
    if (isEmptyObject(strings)) {
        [Smartling showAlert:"No strings found on this page" subText:null];
        return;
    }

    var url = openSavePanel();
    if (url) {
        if ([[url pathExtension] isEqualToString:"json"]) {
            exportStringsToJson(strings, url);
        } else if ([[url pathExtension] isEqualToString:"xlf"]) {
            exportStringsToXliff(strings, url);
        } else if ([[url pathExtension] isEqualToString:"strings"]) {
            exportStringsToFile(strings, url);
        }

        var params = {"Format": [url pathExtension]};
        [Smartling trackEvent:"String export" withParams:params];
    }
}

function uploadStrings(context) {
    // Export strings to a temp file
    var textLayers = getPageTextLayers(context);
    var strings = getStringsFromTextLayers(textLayers);
    var symbolTextLayers = getPageSymbolTextLayers(context);
    addStringsFromSymbolTextLayers(strings, symbolTextLayers);
    strings = removeObjectDuplicates(strings);

    loadFramework(context, "Sketch");
    if (isEmptyObject(strings)) {
        [Smartling showAlert:"No strings found on this page" subText:null];
        return;
    }

    var filename = 'strings-' + Date.now() + '.json';
    var path = '/tmp/' + filename;
    var url = [NSURL fileURLWithPath:path];
    exportStringsToJson(strings, url);

    // Upload file using Smartling framework
    COScript.currentCOScript().setShouldKeepAround_(true);
    var delegate = new MochaJSDelegate(null);
    delegate.setHandlerForSelector("stringsDidUploadForProject:", function(pid) {
        captureContext(context, pid, filename);
    });

    [Smartling uploadStringsFromFile:url withDelegate:delegate.getClassInstance()];
}

function importStrings(context) {
    // Parse xliff
    var strings = openXliff(context);
    if (strings) {
        duplicateCurrentPage(context, " [Translated]");

        // Convert page symbols to regular layers
        convertCurrentPageSymbols(context);

        // Translate page copy
        var sketch = context.api();
        var doc = sketch.selectedDocument;  
        var selectedPage = doc.selectedPage;
        var textLayers = getTextSublayers(selectedPage);
        translateTextLayers(textLayers, strings);

        loadFramework(context, "Sketch");
        [Smartling trackEvent:"String import" withParams:null];
    }
}

function downloadStrings(context) {
    loadFramework(context, "Sketch");

    COScript.currentCOScript().setShouldKeepAround_(true);
    var delegate = new MochaJSDelegate(null);
    delegate.setHandlerForSelector("stringsDidDownload:locale:", function(strings, loc) {
        duplicateCurrentPage(context, ' [' + loc + ']');

        // Convert page symbols to regular layers
        convertCurrentPageSymbols(context);

        // Translate page copy
        var sketch = context.api();
        var doc = sketch.selectedDocument;  
        var selectedPage = doc.selectedPage;
        var textLayers = getTextSublayers(selectedPage);
        translateTextLayers(textLayers, strings);
    });

    [Smartling downloadStringsWithDelegate:delegate.getClassInstance()];
}

function pseudoLocalize(context) {
    loadFramework(context, "Sketch");

    COScript.currentCOScript().setShouldKeepAround_(true);
    var delegate = new MochaJSDelegate(null);
    delegate.setHandlerForSelector("userDidSubmitWithRatio:duplicate:", function(ratio, duplicate) {
        if ([duplicate boolValue]) {
            duplicateCurrentPage(context, ' [' + ratio + '% pseudo localized]');
        }

        // Convert page symbols to regular layers
        convertCurrentPageSymbols(context);

        // Get page text layers
        var sketch = context.api();
        var doc = sketch.selectedDocument;  
        var selectedPage = doc.selectedPage;
        var textLayers = getTextSublayers(selectedPage);

        // Pseudoloc
        pseudoloc.option.prepend = '';
        pseudoloc.option.append = '';

        for (var i in textLayers) {
            var layer = textLayers[i];

            // Transform string
            var translation = pseudoloc.str("" + layer.text);
            translation = pseudoloc.applyRatio(translation, ratio / 100);

            layer.text = translation;
            layer.adjustToFit();
        }
    });

    delegate.setHandlerForSelector("userDidCancel", function(){
        // cancelling
    });

    [Smartling pseudoLocalizeWithDelegate:delegate.getClassInstance()];
}

function captureContext(context, pid, filename) {
    loadFramework(context, "Sketch");

    var sketch = context.api();
    var page = sketch.selectedDocument.selectedPage;

    // Save page to image
    var imgPath = '/tmp/' + page.name + '.png';
    page.export({"output": "/tmp", "overwriting": true, "trimmed": false});

    // Get page strings
    var textLayers = getTextSublayers(page);
    var pageOffset = getPageContentBounds(context);

    // Create dict of strings and coordinates
    var strings = [];
    for (var j in textLayers) {
        var layer = textLayers[j];
        var frame =  layer.frame.asCGRect();
        var rect = layer.container.sketchObject.convertRectToAbsoluteCoordinates(frame);

        // Offset coordinates with page bounds
        rect.origin.x = rect.origin.x - pageOffset.origin.x;
        rect.origin.y = rect.origin.y - pageOffset.origin.y;

        strings.push({
            'text': "" + layer.text,
            'coordinates': {
                'left': rect.origin.x,
                'top': rect.origin.y,
                'width': rect.size.width,
                'height': rect.size.height
            }
        });
    }

    [Smartling uploadContextImage:imgPath forProject:pid stringsFile:filename strings:strings];
}

/////////////
// Private //
/////////////

function getPageTextLayers(context) {
    var sketch = context.api();
    var doc = sketch.selectedDocument;
    var page = doc.selectedPage;
    return getTextSublayers(page);
}

// Returns an array of all text layers contained in a group
function getTextSublayers(group) {
    var textLayers = [];

    // Recursively add texts from group children
    group.iterateWithFilter("isGroup", function(layer) {
        textLayers = textLayers.concat(getTextSublayers(layer));
    });

    // Add text children
    group.iterateWithFilter("isText", function(layer) {
        textLayers.push(layer);
    });

    return textLayers;
}

function getStringsFromTextLayers(textLayers) {
    // Generate keys and store strings in a dict 
    var strings = {};
    for (var i in textLayers) {
        var layer = textLayers[i];
        var key = generateKeyForLayer(layer, strings);
        strings[key] = "" + layer.text;
    }

    return strings;
}

// Symbols: use old APIs to get symbol text layers
function getPageSymbolTextLayers(context) {
    var doc = context.document;
    var page = doc.currentPage();
    return getTextLayersFromSymbol(page);
}

function getTextLayersFromSymbol(symbol) {
    var textLayers = [];
    var layers = [symbol children];
    for (var i = 0; i < layers.count(); i++) {
        var layer = [layers objectAtIndex:i];
        if (layer.isKindOfClass(MSSymbolInstance)){
            textLayers = textLayers.concat(getTextLayersFromSymbol(layer.symbolMaster()));
        } else if (layer.isKindOfClass(MSTextLayer)) {
            textLayers.push(layer);
        }
    }
    return textLayers;
}

function addStringsFromSymbolTextLayers(strings, layers) {
    for (var i in layers) {
        var layer = layers[i];
        strings[layer.objectID()] = "" + layer.stringValue();
    }
}

// Generate a unique key for text layer strings 
function generateKeyForLayer(layer, stringsDict) {
    var key = layer.container.name + '-' + layer.index;
    var keyWithIndex = key;
    var index = 1;
    while (stringsDict[keyWithIndex]) {
        keyWithIndex = key + '-' + index;
        index = index + 1;
    }
    return keyWithIndex;
}

function convertCurrentPageSymbols(context) {
    var textLayers = [];
    var doc = context.document;
    var page = doc.currentPage();
    var layers = [page children];
    for (var i = 0; i < layers.count(); i++) {
        var layer = [layers objectAtIndex:i];

        if (layer.isKindOfClass(MSSymbolInstance)){
            convertSymbol(layer);
        }
    }
}

function convertSymbol(symbol) {
    if (symbol.isKindOfClass(MSSymbolInstance)) {
        var layer = symbol.detachByReplacingWithGroup()
        if (layer) {
            var layers = [layer children];

            for (var i = 0; i < [layers count]; i++) {
                convertSymbol(layers[i])
            }
        }
    }
}

function translateTextLayers(textLayers, strings) {
    for (var i in textLayers) {
        var layer = textLayers[i];
        translateTextLayer(layer, strings);
    }
}

function translateTextLayer(layer, strings) {
    // Find source string from layer text
    var layerText = "" + layer.text;
    for (var j in strings) {
        var stringGroup = strings[j]; // a group containing multiple plural forms
        for (var k in stringGroup) {
            var str = stringGroup[k];
            var source = str['source'];
            if (source && source == layerText && str['target']) {
                layer.text = str['target'];
                layer.adjustToFit();
                return;
            }
        }
    }
}
