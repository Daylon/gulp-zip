'use strict'
const PATH = require('path')
const GUTIL = require('gulp-util')
const THROUGH = require('through2')
const YAZL = require('yazl')
const GET_STREAM = require('get-stream')
const EVENT_STREAM = require('event-stream')

module.exports = (filename, opts) => {
	const FOLDER_NAME_PATTERN = '[a-z0-9\-\_\s\$\,•\+]+'
	, PATH_RADIX = new RegExp(`^(${FOLDER_NAME_PATTERN})\/`, 'i')
	, PARENT_RADIX = new RegExp(`\/(${FOLDER_NAME_PATTERN})\/$`, 'i')

	let hasRootFolder = false
	, archivesCount = 0
	// , rootLevel = -1
	, archives = {}
	, masterPath = ''
	, pathname = ''
	, sketchRoot = ''
	, belongsTo = ''
	, getRadix = function(pathname = ''){
		let radix = pathname.match(PATH_RADIX)
		if(radix === null || radix.length < 2) return pathname
		return radix[ 1 ]
	}
	, newArchive = function(name = 'untitled'){
		if(!archives[ name ]){
			let zip = new YAZL.ZipFile()
			archives[ name ] = { id: archivesCount++, zip, name }
		}
		return archives[ name ] // we return the zip instance
	}
	, zipItOut = function(_that, name = ''){
		let pName
		, pBuffer
		, pAll
		, writeInPipe = (name, contents) => new GUTIL.File({
				cwd: masterPath
				, base: masterPath
				, path: `${masterPath}/${name}.zip`
				, contents
			}
		)
		, writeArchive = function(name, contents){
			_that.push(writeInPipe(name, contents))
			return contents
		}

		archives[ name ].zip.end()
		pName = new Promise((resolve, reject) => resolve(name))
		pBuffer = GET_STREAM.buffer(archives[ name ].zip.outputStream)

		pBuffer
			.then(writeArchive.bind(null, name))
			.catch(err => { throw new GUTIL.PluginError('gulp-zip', err) })

		pAll = Promise.all([ pBuffer, pName ])

		return pAll
	}
	, shorterPath = (pathname, belongsTo) => pathname.replace(new RegExp(`${belongsTo}\/`, 'i'), '')
	, transformFn = (file, enc, cb) => {
		let currentZip = null
		, pathname = file.relative.replace(/\\/g, '/') // Because Windows…
		, finalPathname = ''
		, splitPath = file.base.split('/')
		, captureAll = false
		belongsTo = getRadix(pathname)
		pathname = shorterPath(pathname, belongsTo)

		if(masterPath.length === 0){
			masterPath = file.base
			if(!opts.rootAt){
				opts.rootAt = masterPath
			}
			opts.rootAt = opts.rootAt.replace('/', '')
			sketchRoot = splitPath[ splitPath.length - 2 ]
		}
		captureAll = (sketchRoot === opts.rootAt	)
		finalPathname = (captureAll === true ? pathname : file.relative)

		if(file.isNull() && file.stat && file.stat.isDirectory && file.stat.isDirectory()){
			// IS A DIRECTORY
			if(captureAll === true){
				newArchive(belongsTo) // feeds a new instance of ZipFile and set archives[].zip with this instance
				if(hasRootFolder === false){
					hasRootFolder = true
				}
			}
		} else {
			const stat = {
				compress: true
				, mtime: file.stat ? file.stat.mtime : new Date()
				, mode: file.stat ? file.stat.mode : null
			}

			if(!currentZip && archivesCount === 0){ // we never found a root folder, so we'll fall back onto parent
				currentZip = newArchive(sketchRoot)
			} else {
				currentZip = archives[ captureAll === true ? belongsTo : sketchRoot ] // depending on the scenario, the referal zip instance is either itself or root
			}

			if (file.isStream()) {
				currentZip.zip.addReadStream(file.contents, finalPathname, stat)
			}

			if (file.isBuffer()) {
				currentZip.zip.addBuffer(file.contents, finalPathname, stat)
			}
		}
		cb()
	}
	, flushFn = function(cb){
		let names = Object.keys(archives)
		, promises = []
		for(let name of names){
			promises.push(zipItOut(this, name))
		}
		Promise
			.all(promises)
			.then(() => { GUTIL.log(`${promises.length} archives have been zipped out`); cb(); })
	}

	opts = Object.assign({
		compress: true
		, inferFilename: false
	}, opts)

	if (!filename && opts.inferFilename !== true) {
		throw new GUTIL.PluginError('gulp-zip', '`filename` required')
	}

	return THROUGH.obj(transformFn, flushFn)
}
