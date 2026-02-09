import { each } from 'lo';
import { REGEX } from './constants.js';

// Note: [type, exts, compress, charset]
const data = [
    ['audio/aac', ['aac']],
    ['video/x-msvideo', ['avi']],
    ['image/avif', ['avif']],
    ['video/av1', ['av1']],
    ['application/octet-stream', ['bin', 'exe', 'dll', 'deb', 'dmg', 'iso', 'img', 'msi', 'msp', 'msm'], 1],
    ['image/bmp', ['bmp'], 1],
    ['text/css', ['css'], 1, 'utf-8'],
    ['text/csv', ['csv'], 1, 'utf-8'],
    ['application/vnd.ms-fontobject', ['eot'], 1],
    ['application/epub+zip', ['epub']],
    ['image/gif', ['gif']],
    ['application/gzip', ['gz']],
    ['text/html', ['html', 'htm', 'shtml'], 1, 'utf-8'],
    ['image/x-icon', ['ico'], 1],
    ['text/calendar', ['ics'], 0, 'utf-8'],
    ['image/jpeg', ['jpg', 'jpeg']],
    ['text/javascript', ['js', 'mjs'], 1, 'utf-8'],
    ['application/json', ['json', 'map'], 1, 'utf-8'],
    ['application/ld+json', ['jsonld'], 1],
    ['audio/mpeg', ['mp3']],
    ['video/mp4', ['mp4']],
    ['video/mpeg', ['mpg', 'mpeg']],
    ['audio/ogg', ['ogg', 'oga']],
    ['video/ogg', ['ogv']],
    ['application/ogg', ['ogx']],
    ['audio/opus', ['opus']],
    ['font/otf', ['otf'], 1],
    ['application/pdf', ['pdf']],
    ['image/png', ['png']],
    ['application/rtf', ['rtf'], 1],
    ['image/svg+xml', ['svg', 'svgz'], 1],
    ['image/tiff', ['tiff', 'tif']],
    ['video/mp2t', ['ts']],
    ['font/ttf', ['ttf'], 1],
    ['text/plain', ['txt'], 1, 'utf-8'],
    ['application/wasm', ['wasm'], 1],
    ['video/webm', ['webm']],
    ['audio/webm', ['weba']],
    ['application/manifest+json', ['webmanifest'], 1, 'utf-8'],
    ['image/webp', ['webp']],
    ['font/woff', ['woff']],
    ['font/woff2', ['woff2']],
    ['application/xhtml+xml', ['xhtml'], 1],
    ['application/xml', ['xml'], 1],
    ['application/zip', ['zip']],
    ['video/3gpp', ['3gp', '3gpp']],
    ['video/3gpp2', ['3g2']],
    ['model/gltf+json', ['gltf'], 1],
    ['model/gltf-binary', ['glb'], 1],
    ['application/atom+xml', ['atom'], 1],
    ['application/java-archive', ['jar', 'war', 'ear']],
    ['application/mac-binhex40', ['hqx']],
    ['application/msword', ['doc']],
    ['application/postscript', ['ps', 'eps', 'ai'], 1],
    ['application/rss+xml', ['rss'], 1],
    ['application/vnd.apple.mpegurl', ['m3u8']],
    ['application/vnd.google-earth.kml+xml', ['kml'], 1],
    ['application/vnd.google-earth.kmz', ['kmz']],
    ['application/vnd.ms-excel', ['xls']],
    ['application/vnd.ms-powerpoint', ['ppt']],
    ['application/vnd.oasis.opendocument.graphics', ['odg']],
    ['application/vnd.oasis.opendocument.presentation', ['odp']],
    ['application/vnd.oasis.opendocument.spreadsheet', ['ods']],
    ['application/vnd.oasis.opendocument.text', ['odt']],
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', ['pptx']],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['xlsx']],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['docx']],
    ['application/vnd.wap.wmlc', ['wmlc']],
    ['application/x-7z-compressed', ['7z']],
    ['application/x-cocoa', ['cco']],
    ['application/x-java-archive-diff', ['jardiff']],
    ['application/x-java-jnlp-file', ['jnlp']],
    ['application/x-makeself', ['run']],
    ['application/x-perl', ['pl', 'pm']],
    ['application/x-pilot', ['prc', 'pdb']],
    ['application/x-rar-compressed', ['rar']],
    ['application/x-redhat-package-manager', ['rpm']],
    ['application/x-sea', ['sea']],
    ['application/x-shockwave-flash', ['swf']],
    ['application/x-stuffit', ['sit']],
    ['application/x-tcl', ['tcl', 'tk']],
    ['application/x-x509-ca-cert', ['crt', 'der', 'pem']],
    ['application/x-xpinstall', ['xpi']],
    ['application/xspf+xml', ['xspf'], 1],
    ['audio/midi', ['mid', 'midi', 'kar']],
    ['audio/x-m4a', ['m4a']],
    ['audio/x-realaudio', ['ra']],
    ['image/vnd.wap.wbmp', ['wbmp']],
    ['image/x-jng', ['jng']],
    ['text/mathml', ['mml'], 0, 'utf-8'],
    ['text/vnd.sun.j2me.app-descriptor', ['jad'], 0, 'utf-8'],
    ['text/vnd.wap.wml', ['wml'], 0, 'utf-8'],
    ['text/x-component', ['htc'], 0, 'utf-8'],
    ['video/quicktime', ['mov']],
    ['video/x-flv', ['flv']],
    ['video/x-m4v', ['m4v']],
    ['video/x-mng', ['mng']],
    ['video/x-ms-asf', ['asf', 'asx']],
    ['video/x-ms-wmv', ['wmv']]
];

class Mime {

    constructor (type, exts, compress, charset) {
        this.type = type;
        this.exts = exts;
        this.compress = !!compress;
        this.charset = charset;
    }

    get header () {
        if (this.charset) {
            return `${this.type}; charset=${this.charset}`;
        }
        return this.type;
    }

}

const mimes = new Map();
const extToMime = new Map();
const typeToExt = new Map([
    // Note: Obsolete duplicates
    ['text/xml', 'xml'],
    ['image/x-ms-bmp', 'bmp'],
    ['application/javascript', 'js'],
    ['audio/x-midi', 'mid']
]);

each(data, args => {
    let mime = new Mime(...args);
    mimes.set(mime.type, mime);
    each(mime.exts, ext => {
        extToMime.set(ext, mime);
    });
    typeToExt.set(mime.type, mime.exts.at(0));
});

export function mimeFromExt (ext) {
    if (ext?.startsWith('.')) {
        ext = ext.slice(1);
    }
    return extToMime.get(ext);
}

export function mimeFromPath (path) {
    let match = path?.match(REGEX.ext);
    if (!match) {
        return;
    }
    return mimeFromExt(match[1]);
}

export function mimeFromType (type) {
    if (type?.includes(';')) {
        type = type.split(';')[0].trim();
    }
    return mimes.get(type);
}

export function extFromType (type) {
    if (type?.includes(';')) {
        type = type.split(';')[0].trim();
    }
    return typeToExt.get(type);
}
