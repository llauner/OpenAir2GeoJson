// Import dependencies
var moment      = require('moment'),
    colors		= require('colors/safe'),
    axios       = require('axios'),
    FormData    = require('form-data'),
    fs			= require('memfs'),
    PromiseFtp  = require('promise-ftp');

    
const OpenAipAirspaceUrl = "https://www.planeur.net/_download/airspaces/france.txt";
const OgreWebClientUrl = "http://ogre.adc4gis.com/convert";     // See also: https://ogre.adc4gis.com/
const AirspaceDirectory_Heatmap = "/heatmap/airspacedata";
const AirspaceDirectory_Tracemap = "/tracemap/airspacedata";
const NetcoupeAirspaceFileName = "netcoupe-france.geojson";
const NetcoupeAirspaceMetadataFileName = "netcoupe-france-metadata.json";

var FtpServerNameHeatmap = process.env.FTP_SERVER_NAME_HEATMAP;
var FtpLoginHeatmap = process.env.FTP_LOGIN_HEATMAP;
var FtpPasswordHeatmap = process.env.FTP_PASSWORD_HEATMAP;

var _ftpConnectionInfo = {host: FtpServerNameHeatmap, user: FtpLoginHeatmap, password: FtpPasswordHeatmap};
var _metadata = {};

exports.main = (req, res) => {
    main().then(response => {
        var message = ">>> OK :" + response;
        console.log(message);
        res.send(message);
    });
};

if (process.env.DEBUG) {
    main().then(response => {
        console.log(">>> OK :" + response);
        process.exit(0);
    });
}

async function main(){
    console.log(">>> OpenAir to GeoJSON converter");
    

    var openAirAirspace = await getOpenAirAirsapceFile();
    buildMetadata(openAirAirspace);
    var geojsonOpenAirSpace = await submitToOgr2ogr(openAirAirspace);
    await dumpToFtp(geojsonOpenAirSpace);

    return JSON.stringify(_metadata);
}

async function getOpenAirAirsapceFile() {
    console.log(colors.green("Getting airspace file from: " + OpenAipAirspaceUrl));
    
    const reqOptions = {
        method: 'get',
        url: OpenAipAirspaceUrl
        };

    return axios(reqOptions)
        .then(response => {
            return response.data;
        })
        .catch(error => {
            console.log(error);
        });
}

function buildMetadata(openAirAirspace) {
    const sourceKeyword = "SOURCE:";
    // Look for the line: "SOURCE: AIP FRANCE 2019/08/15       *"
    var sourceStart = openAirAirspace.search(sourceKeyword);
    var sourceEnd = openAirAirspace.indexOf('*', sourceStart);
    var source = openAirAirspace.substr(sourceStart, sourceEnd-sourceStart).trim();
    source = source.replace(sourceKeyword, '').trim();

    // Populate metadata
    _metadata.date = moment().format('DD/MM/YYYY HH:mm:ss');
    _metadata.source = `${OpenAipAirspaceUrl}  --> ${source}`;
}

async function submitToOgr2ogr(airspaceText) {
    console.log(colors.yellow(`POST to ogr2ogr webclient: ${OgreWebClientUrl}`));
    fs.writeFileSync('/france.txt', airspaceText);      // Save to dummy in memory file

    var form = new FormData();
    form.append('skipFailures', 'true');
    form.append('upload', fs.createReadStream('/france.txt'));

    const reqOptions = {
        method: 'post',
        url: OgreWebClientUrl,
        data: form,
        headers: form.getHeaders()
        };

    return axios(reqOptions)
        .then(function (response) {
            return response.data;
        })
        .catch(err => {
            return console.log(err);
        });
}

async function dumpToFtp(data){
    console.log(colors.yellow(">>> Writing result to FTP : "+ FtpServerNameHeatmap));
    var jsonGeoData = JSON.stringify(data);
    var jsonMetadata = JSON.stringify(_metadata);

    var ftp = new PromiseFtp();
    return ftp.connect(_ftpConnectionInfo)
        .then(function (serverMessage) {
            return ftp.cwd(AirspaceDirectory_Heatmap);
        })
        .then(function () {
            return ftp.put(jsonGeoData, NetcoupeAirspaceFileName);
        })
        .then(function () {
            return ftp.put(jsonMetadata, NetcoupeAirspaceMetadataFileName);
        })
        .then(function () {
            return ftp.cwd(AirspaceDirectory_Tracemap);
        })
        .then(function () {
            return ftp.put(jsonGeoData, NetcoupeAirspaceFileName);
        })
        .then(function () {
            return ftp.put(jsonMetadata, NetcoupeAirspaceMetadataFileName);
        })
        .then(function () {
            return ftp.end();
        });
}



