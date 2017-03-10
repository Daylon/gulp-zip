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
	, zipItOut = function( name = '', file = {} ){
		let newArchive = ( contents ) => new GUTIL.File({
				cwd: file.cwd,
				base: file.base,
				path: PATH.join(file.base, filename),
				contents
			}
		)

		GET_STREAM
			.buffer( archives[ name ].zip.outputStream )
			.then( function( contents ){
				if( true ){
					this.push( newArchive( contents ) )
				}
			})
			.catch( err => { throw new GUTIL.PluginError( 'gulp-zip', err ) } )

		archives[ name ].zip.end()
	}
	, transformFn = (file, enc, cb) => {
		// Because Windows...
		pathname = file.relative.replace(/\\/g, '/')
		belongsTo = getRadix( pathname )

		if( masterPath.length === 0 ){
			console.log( file.base )
			masterPath = file.base
			hasIgnoredRootFolder = true
		}

		if( file.isNull() && file.stat && file.stat.isDirectory && file.stat.isDirectory() ){
			// IS A DIRECTORY
			if( /\//.test( pathname ) ===false ){ // TODO: is an archive!
				newArchive( pathname ) // feeds a new instance of ZipFile and set archives[].zip with this instance
			} else { // this is a regular folder
				archives[ belongsTo ].zip.addEmptyDirectory(pathname, {
					mtime: file.stat.mtime || new Date(),
					mode: file.stat.mode
				})
			}
		} else {
			const stat = {
				compress: opts.compress,
				mtime: file.stat ? file.stat.mtime : new Date(),
				mode: file.stat ? file.stat.mode : null
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
		for( let name of names ){
			zipItOut( name )
		}
		cb()
	}

	opts = Object.assign({
		compress: true,
		inferFilename: false
	}, opts)

	if (!filename && opts.inferFilename === true) {
		throw new GUTIL.PluginError('gulp-zip', '`filename` required')
	}

	return THROUGH.obj( transformFn, flushFn )
}
