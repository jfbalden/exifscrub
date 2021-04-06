var fs = require("fs");
var exif = require("exif");
var piexif = require("piexifjs");
var bodyParser = require("body-parser");
var express = require("express");
const deepcopy = require("rfdc")();
const FileType = require('file-type');
var path = require("path");

var multer  = require("multer");
var upload = multer({ dest: "img/uploads/" });

const app = express();
const port = 4000;

var router = express.Router();

app.use(bodyParser.urlencoded({extended: true}))
app.use('/', router);

router.get("/static/js/:file", (req, res) => {
    res.sendFile(`build/static/js/${req.params.file}`, { root : __dirname });
});
router.get("/static/css/:file", (req, res) => {
    res.sendFile(`build/static/css/${req.params.file}`, { root : __dirname });
});

router.get('/', (req, res) => {
    res.sendFile("build/index.html", { root : __dirname });
});
router.get('/favicon.ico', (req, res) => {
    res.sendFile("build/favicon.ico", { root : __dirname });
});

function ExposureMode(value){
    if(value >= 0 && value <= 2)
        return ["Auto", "Manual", "Auto bracket"][value];
    else return value;
}

function ExposureProgram(value){
    if(value >= 0 && value <= 9)
        return ["Not Defined", "Manual", "Program AE", 
                "Aperture-priority AE", "Shutter speed priority AE", "Creative (Slow speed)",
                "Action (High speed)", "Portrait", "Landscape", "Bulb"][value];
    else return `${value} (Non-standard value)`;
}

function Flash(value){
    let flashValues = 
    {
        "0"     : "No Flash",
        "1"     : "Fired",
        "5"     : "Fired, Return not detected",
        "7"     : "Fired, Return detected",
        "8"     : "On, Did not fire",
        "9"     : "On, Fired",
        "13"    : "On, Return not detected",
        "15"    : "On, Return detected",
        "16"    : "Off, Did not fire",
        "20"    : "Off, Did not fire, Return not detected",
        "24"    : "Auto, Did not fire",
        "25"    : "Auto, Fired",
        "29"    : "Auto, Fired, Return not detected",
        "31"    : "Auto, Fired, Return detected",
        "32"    : "No flash function",
        "48"    : "Off, No flash function",
        "65"    : "Fired, Red-eye reduction",
        "69"    : "Fired, Red-eye reduction, Return not detected",
        "71"    : "Fired, Red-eye reduction, Return detected",
        "73"    : "On, Red-eye reduction",
        "77"    : "On, Red-eye reduction, Return not detected",
        "79"    : "On, Red-eye reduction, Return detected",
        "80"    : "Off, Red-eye reduction",
        "88"    : "Auto, Did not fire, Red-eye reduction",
        "89"    : "Auto, Fired, Red-eye reduction",
        "93"    : "Auto, Fired, Red-eye reduction, Return not detected",
        "95"    : "Auto, Fired, Red-eye reduction, Return detected"
    };

    if( Object.keys(flashValues).includes(`${value}`) )
        return flashValues[value];
    else return `${value} (Non-standard value)`;
}

function MeteringMode(value){
    if(value == 255) return "Other";
    else if(value >= 0 && value <= 6)
        return ["Unknown", "Average", "Center-weighted average", 
                "Spot", "Multi-spot", "Multi-segment", "Partial"][value];
    else return `${value} (Non-standard value)`;
}

function Orientation(value){
    if(value >= 1 && value <= 8)
        return ["Horizontal (normal)", "Mirror horizontal", "Rotate 180", 
                "Mirror vertical", "Mirror horizontal and rotate 270 CW", "Rotate 90 CW",
                "Mirror horizontal and rotate 90 CW", "Rotate 270 CW"][value-1];
    else return `${value} (Non-standard value)`;
}

function WhiteBalance(value){
    if(value != 0 && value != 1) return `${value} (Non-standard value)`;
    else return value ? "Manual" : "Auto";
}

function Xdpi(x_arr){
    return `${x_arr[0] / x_arr[1]}dpi`;
}
function Ydpi(y_arr){
    return `${y_arr[0] / y_arr[1]}dpi`;
}

function DimensionX(value){
    return `${value}px`;
}
function DimensionY(value){
    return `${value}px`;
}

function FocalLength(f_arr){
    return `${Math.round( ( f_arr[0] / f_arr[1] ) * 10 ) / 10}mm`;
}

function FocalLength35mm(value){
    return `${value}mm`;
}

function ExposureTime(ext_arr){
    return `${Math.round( ( ext_arr[0] / ext_arr[1] ) * 1000 ) / 1000}s (${ext_arr[0]}/${ext_arr[1]})`;
}

function FStop(ap_arr){
    return `f/${Math.round( Math.sqrt( Math.pow( 2, ap_arr[0] / ap_arr[1] ) ) * 10 ) / 10}`;
}

function GPSAltitudeRef(value){
    if(value >= 0 && value <= 1)
        return ["Above Sea Level", "Below Sea Level"][value];
    else return `${value} (Non-standard value)`;
}
function GPSAltitude(alt_arr){
    return `${alt_arr[0] / alt_arr[1]} meters`;
}
function GPSLatitude(lat_arr){
    return `${lat_arr[0][0] / lat_arr[0][1]}° ${lat_arr[1][0] / lat_arr[1][1]}' ${lat_arr[2][0] / lat_arr[2][1]}"`;
}
function GPSLongitude(lon_arr){
    return `${lon_arr[0][0] / lon_arr[0][1]}° ${lon_arr[1][0] / lon_arr[1][1]}' ${lon_arr[2][0] / lon_arr[2][1]}"`;
}

function interpretValue(tag, value){
    let echoFunction = (v) => v;    // For straightforward values which require no interpretation, e.g. Make & Model
    let interpretationFunctions = 
    {
        "1"     : echoFunction,
        "2"     : GPSLatitude,
        "3"     : echoFunction,
        "4"     : GPSLongitude,
        "5"     : GPSAltitudeRef,
        "6"     : GPSAltitude,
        "7"     : echoFunction,
        "271"   : echoFunction,
        "272"   : echoFunction,
        "274"   : Orientation,
        "282"   : Xdpi,
        "283"   : Ydpi,
        "33434" : ExposureTime,
        "34850" : ExposureProgram,
        "34855" : echoFunction,
        "36867" : echoFunction,
        "37378" : FStop,
        "37383" : MeteringMode,
        "37385" : Flash,
        "37386" : FocalLength,
        "40962" : DimensionX,
        "40963" : DimensionY,
        "41986" : ExposureMode,
        "41987" : WhiteBalance,
        "41989" : FocalLength35mm,
        "42036" : echoFunction
    }

    return interpretationFunctions[tag](value);
}

function mapExifNames(exifObj){
    console.log(Object.keys(exifObj).length);
    let result = {};
    for(var ifd in exifObj){
        if(ifd == "thumbnail") continue;
        result[ifd] = {};

        for( var tag in exifObj[ifd] ){
            result[ifd][ piexif.TAGS[ifd][tag]["name"] ] = interpretValue(tag, exifObj[ifd][tag]);
        }
    }
    return result;
}

function pruneExif(exifObj, keepTags){
    // Prune the EXIF object of unwanted tags

    Object.keys(exifObj).forEach( key => Object.keys(keepTags).includes(key) || delete exifObj[key] );
    Object.keys(exifObj).includes("0th") ? Object.keys(exifObj["0th"]).forEach( key => keepTags["0th"].includes(key) || delete exifObj["0th"][key] ) : null;
    Object.keys(exifObj).includes("Exif") ? Object.keys(exifObj["Exif"]).forEach( key => keepTags["Exif"].includes(key) || delete exifObj["Exif"][key] ) : null;
    Object.keys(exifObj).includes("GPS") ? Object.keys(exifObj["GPS"]).forEach( key => keepTags["GPS"].includes(key) || delete exifObj["GPS"][key] ) : null;
}


function handleFileRequest(req, res){
    if(!req.file){
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
            error: 2,
            msg: "Please select a file."
        }));
    }else{
        fs.readFile(req.file.path, function(err, data) {
            if (err) throw err;

            (async () => {
                var fileCheck = await FileType.fromFile(req.file.path);
                if(fileCheck.mime != "image/jpeg")
                    return {type: 0, message:"Wrong file type; only .JPG/.JPEG supported."};
                
                if(req.file.size > 2000000)
                    return {type: 0, message:"File too large; maximum of 2MB allowed."};
                
            })().then( (errorObj) =>{
                if(errorObj){
                    console.log(errorObj);
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: errorObj }));
                    return;
                }
                console.log(req.params);

                var jpegdata = "data:image/jpeg;base64," + Buffer.from(data).toString('base64');
                var exifObj = piexif.load(jpegdata);
                var exifRawObj = deepcopy(exifObj);

                var keepTags;

                if(req.params.mode === "scrub"){
                    if(req.params.submode){
                        keepTags = 
                            {
                                "0th" : ['271',
                                            '272',
                                            '274',
                                            '282',
                                            '283'],
                                "Exif" : ['33434',
                                            '34850',
                                            '34855',
                                            '36867',
                                            '37378',
                                            '37383',
                                            '37385',
                                            '37386',
                                            '40962',
                                            '40963',
                                            '41986',
                                            '41987',
                                            '41989',
                                            '42036'],
                                "GPS" : []
                            };
                    }else{
                        if(req.body.orientation){
                            keepTags = {"0th" : ['274'], "Exif" : [], "GPS" : []};
                        }else{
                            keepTags = {"0th" : [], "Exif" : [], "GPS" : []};
                        }
                    }
                }else{
                    keepTags = 
                        {
                            "0th" : ['271',
                                        '272',
                                        '274',
                                        '282',
                                        '283'],
                            "Exif" : ['33434',
                                        '34850',
                                        '34855',
                                        '36867',
                                        '37378',
                                        '37383',
                                        '37385',
                                        '37386',
                                        '40962',
                                        '40963',
                                        '41986',
                                        '41987',
                                        '41989',
                                        '42036'],
                            "GPS"  : ["1", "2", "3", "4", "5", "6", "7"]
                        };
                }

                pruneExif(exifObj, keepTags);

                if(req.params.mode == "scrub"){
                    let exifBytes = piexif.dump(exifObj);
                    jpegdata = piexif.insert(exifBytes, piexif.remove(jpegdata));
                }

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                    jpeg: jpegdata,
                    exif: mapExifNames(exifObj),
                    gpsRaw: req.params.mode == "view" ? exifRawObj["GPS"] : undefined,
                    mode: req.params.mode
                }));

                // Delete the file:
                fs.unlink(req.file.path, (err) => {
                    if (err) {
                        console.error(err)
                        return;
                    }
                });
            });
        });
    }
}

router.post( "/upload/:mode", upload.single("imgupload"), (req, res) => handleFileRequest(req, res) );
router.post( "/upload/:mode/:submode", upload.single("imgupload"), (req, res) => handleFileRequest(req, res) );

router.get('/css/style.css', (req, res) => {
    res.sendFile("css/style.css", { root : __dirname });
});
router.get('/css/tst.css', (req, res) => {
    res.sendFile("css/tst.css", { root : __dirname });
});

router.get('/js/main.js', (req, res) => {
    res.sendFile("js/main.js", { root : __dirname });
});

app.listen(port);