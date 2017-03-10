'use strict'
const PATH = require('path')
const GUTIL = require('gulp-util')
const THROUGH = require('through2')
const YAZL = require('yazl')
const GET_STREAM = require('get-stream')
const EVENT_STREAM = require( 'event-stream' )

module.exports = ( filename, opts ) => {
	const PATH_RADIX = /^([a-z0-9\-\_\s]+)\//i

	let hasIgnoredRootFolder = false
	, archivesCount = 0
	, archives = {}
	, masterPath = ''
	, pathname = ''
	, belongsTo = ''
	, getRadix = function( pathname = '' ){
		let radix = pathname.match( PATH_RADIX )
		if( radix === null || radix.length < 2 ) return pathname
		return radix[ 1 ]
	}
	, newArchive = function( name = 'untitled' ){
		let zip = new YAZL.ZipFile()
		archives[ name ] = { id: archivesCount++, zip, name }
		return archives[ name ] // we return the zip instance
	}
	, zipItOut = function( _that, name = '' ){
		let pName
		, pBuffer
		, pAll
		, writeInPipe = ( name, contents ) => new GUTIL.File({
				cwd: masterPath
				, base: masterPath
				, path: `${masterPath}/${name}.zip`
				, contents
			}
		)
		, writeArchive = function( name, contents ){
			_that.push( writeInPipe( name, contents ) )
			return contents
		}

		archives[ name ].zip.end()
		pName = new Promise( ( resolve, reject ) => resolve( name ) )
		pBuffer = GET_STREAM.buffer( archives[ name ].zip.outputStream )

		pBuffer
			.then( writeArchive.bind( null, name ) )
			.catch( err => { throw new GUTIL.PluginError( 'gulp-zip', err ) } )

		pAll = Promise.all( [ pBuffer, pName ] )

		return pAll
	}
	, shorterPath = ( pathname, belongsTo ) => pathname.replace( new RegExp( `${belongsTo}\/`, 'i'), '' )
	, transformFn = (file, enc, cb) => {
		// Because Windows...
		pathname = file.relative.replace(/\\/g, '/')
		belongsTo = getRadix( pathname )
		pathname = shorterPath( pathname, belongsTo )

		if( masterPath.length === 0 ){
			masterPath = file.base
			hasIgnoredRootFolder = true
		}

		if( file.isNull() && file.stat && file.stat.isDirectory && file.stat.isDirectory() ){
			// IS A DIRECTORY
			if( pathname === belongsTo ){ // TODO: is an archive!
				newArchive( pathname ) // feeds a new instance of ZipFile and set archives[].zip with this instance
			}
		} else {
			const stat = {
				compress: true
				, mtime: file.stat ? file.stat.mtime : new Date()
				, mode: file.stat ? file.stat.mode : null
			}

			if (file.isStream()) {
				archives[ belongsTo ].zip.addReadStream(file.contents, pathname, stat)
			}

			if (file.isBuffer()) {
				archives[ belongsTo ].zip.addBuffer(file.contents, pathname, stat)
			}
		}
		cb()
	}
	, flushFn = function( cb ){
		let names = Object.keys( archives )
		, promises = []
		for( let name of names ){
			promises.push( zipItOut( this, name ) )
		}
		Promise
			.all( promises )
			.then( () => { GUTIL.log(`${promises.length} archives have been zipped out`); cb(); })
	}

	opts = Object.assign({
		compress: true
		, inferFilename: false
	}, opts)

	if (!filename && opts.inferFilename === true) {
		throw new GUTIL.PluginError('gulp-zip', '`filename` required')
	}

	return THROUGH.obj( transformFn, flushFn )
}
