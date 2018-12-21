'use strict';

const cors = require('cors');
const express = require('express');
const bodyParser = require('body-parser');
const process = require('process');
const url = require('url');
const queryString = require('querystring');

const OK = 200;
const CREATED = 201;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVER_ERROR = 500;


//Main URLs
const DOCS = '/docs';
const COMPLETIONS = '/completions';

//Default value for count parameter
const COUNT = 5;

/** Listen on port for incoming requests.  Use docFinder instance
 *  of DocFinder to access document collection methods.
 */
function serve(port, docFinder) {
  const app = express();
  app.locals.port = port;
  app.locals.finder = docFinder;
  setupRoutes(app);
  const server = app.listen(port, async function() {
    console.log(`PID ${process.pid} listening on port ${port}`);
  });
  return server;
}

module.exports = { serve };



/** Setting up the routes for the webservice application
 */
function setupRoutes(app) {
  app.use(cors());            //for security workaround in future projects
  app.use(bodyParser.json()); //all incoming bodies are JSON

  //added routes for required 4 services
  app.post(DOCS, doCreateDoc(app));
  app.get(`${DOCS}/:name`, doGetDoc(app));
  app.get(COMPLETIONS, doCompletionsText(app));
  app.get(DOCS, doSearchDocs(app));
  app.use(doErrors()); //must be last; setup for server errors   
}


/** Method created for calling the webservice,
 * which adds the document to the server
 */
function doCreateDoc(app) {
  return errorWrap(async function(req, res) {
	try {	
		const obj = req.body;
		// checking the request body has property "name", else throw an error of bad param
		if(obj.hasOwnProperty("name")){
			// checking the request body has property "content", else throw an error of bad param
			if(obj.hasOwnProperty("content")){
				// calling add content database service to add the new document
				const results = await app.locals.finder.addContent(obj.name, obj.content);
				// setting up the response accordingly
				res.append('Location', baseUrl(req) + DOCS+ '/' + obj.name);
				res.status(CREATED)
				res.send({"href": baseUrl(req) + DOCS+ '/' + obj.name});
			}else{
				throw {
				  isDomain: true,
				  errorCode: 'BAD_PARAM',
				  message: `required body parameter \"content\" is missing`,
				};
			}
		}else{
			throw {
			  isDomain: true,
			  errorCode: 'BAD_PARAM',
			  message: `required body parameter \"name\" is missing`,
			};
		}	
	}
	catch(err) {
		const mapped = mapError(err);
		if(mapped.status == 400){
			//removing the status from response
			const status = mapped.status;
			delete mapped.status;
			res.status(status).json(mapped);		
		}else{
			res.status(mapped.status).json(mapped);
		}
	}
  });
}


/** Method for calling the webservice,
 * which returns the content of document by passing the name
 */
function doGetDoc(app) {
  return errorWrap(async function(req, res) {
    try {
		const name = req.params.name;
		//calling up the data service to find the document contents.
		const results = await app.locals.finder.docContent(name);
		const resultObj = {};
		resultObj["content"]=results;
		resultObj["links"]=[];
		const linkObj={};
		linkObj["rel"]="self";
		linkObj["href"]=baseUrl(req)+DOCS+'/'+name;
		resultObj["links"].push(linkObj);
		res.json(resultObj);
    }
    catch(err) {
		if(err.code === 'NOT_FOUND'){
			//setting up the thrown error doc finder store js 
			err.isDomain = true;
			err.errorCode = err.code;
			delete err.code;
			const mapped = mapError(err);
			const status = mapped.status;
			delete mapped.status;
			res.status(status).json(mapped);
		}else{
			const mapped = mapError(err);
			res.status(mapped.status).json(mapped);
		}
    }
  });
}



/** Method for calling the webservice,
 * which provides the autocomplete suggestions for the word
 */
function doCompletionsText(app) {
  return errorWrap(async function(req, res) {
    try {	
		
		//checking if the query parameter has param 'text', else throwing the error       
		if(req.query.text){
			// calling up the autocomplete database service
			const results = await app.locals.finder.complete(req.query.text);
			res.json(results);
		}else{
			throw {
			  isDomain: true,
			  errorCode: 'BAD_PARAM',
			  message: `required query parameter \"text\" is missing`,
			};
		}
    }
    catch(err) {
		const mapped = mapError(err);
		if(mapped.status == 400){
			//removing the status from response
			const status = mapped.status;
			delete mapped.status;
			res.status(status).json(mapped);	
		}else{
			res.status(mapped.status).json(mapped);
		}
    }
  });
}


/** Method for calling the webservice,
 * which search the words in the stored documents
 */
function doSearchDocs(app) {
  return errorWrap(async function(req, res) {
    try {		
		let startIndex=0;
		let count=5;
		//checking if the query has parameter 'q', else throwing the error     
		if(req.query.q){
			let queryString = baseUrl(req) + DOCS+ '?q=';
			let queryStringArr = req.query.q.split(" ");
			queryStringArr = queryStringArr.map((elem,index)=>index>0? "%20"+elem: elem);
			for(const str of queryStringArr){
				queryString += str;
			}
			const results = await app.locals.finder.find(req.query.q);
			if(req.query.start){
				//checking if the query parameter 'start' is numeric and is non-negative, else throwing the error 
				if(/^\d+$/.test(req.query.start) && req.query.start >= 0){
					startIndex=Number(req.query.start);
				}else{
					throw {
					  isDomain: true,
					  errorCode: 'BAD_PARAM',
					  message: `bad query parameter \"start\"`,
					};
				}		
			}
			if(req.query.count){
				//checking if the query parameter 'count' is numeric and is non-negative, else throwing the error 
				if(/^\d+$/.test(req.query.count) && req.query.count >= 0){
					count=Number(req.query.count);	
				}else{
					throw {
					  isDomain: true,
					  errorCode: 'BAD_PARAM',
					  message: `bad query parameter \"count\"`,
					};
				}	
			}
			let endIndex=0;
			let searchResultArr = [];
			let resultObj = {};
			if(startIndex+count > results.length?endIndex= results.length:endIndex=startIndex+count);
			// only setting ht results starting from the start index up till the count
			for(let x=startIndex; x< endIndex; x++){
				let elem = results[x];
				elem["href"] = baseUrl(req) + DOCS+ '/' + elem.name;
				searchResultArr.push(elem);
			}
			// setting up the links array as well as the total count property
			let linksArr =[];
			let linksObjSelf = {};
			linksObjSelf["rel"] = "self";
			linksObjSelf["href"] = queryString+"&start="+startIndex+"&count="+count;
			linksArr.push(linksObjSelf);
			if(searchResultArr.length > 0 && results.length > count){
				let linksObjPrevNext = {};
				// setting up the next or previous link accordingly
				if(startIndex+count >= results.length){
					linksObjPrevNext["rel"] = "previous";
					linksObjPrevNext["href"] = queryString+"&start="+(startIndex-count)+"&count="+count;
				}else{
					linksObjPrevNext["rel"] = "next";
					linksObjPrevNext["href"] = queryString+"&start="+(startIndex+count)+"&count="+count;
				}	
				linksArr.push(linksObjPrevNext);
			}
			resultObj.results=searchResultArr;
			resultObj.totalCount=results.length;
			resultObj.links=linksArr;
			//setting up the result object in the results
			res.json(resultObj);
		}else{
			throw {
			  isDomain: true,
			  errorCode: 'BAD_PARAM',
			  message: `required query parameter \"q\" is missing`,
			};
		}
    }
    catch(err) {
		const mapped = mapError(err);
		if(mapped.status == 400){
			//removing the status from response
			const status = mapped.status;
			delete mapped.status;
			res.status(status).json(mapped);		
		}else{
			res.status(mapped.status).json(mapped);
		}
    }
  });
}


//@TODO: add handler creation functions called by route setup
//routine for each individual web service.  Note that each
//returned handler should be wrapped using errorWrap() to
//ensure that any internal errors are handled reasonably.

/** Return error handler which ensures a server error results in nice
 *  JSON sent back to client with details logged on console.
 */ 
function doErrors(app) {
  return async function(err, req, res, next) {
    res.status(SERVER_ERROR);
    res.json({ code: 'SERVER_ERROR', message: err.message });
    console.error(err);
  };
}

/** Set up error handling for handler by wrapping it in a 
 *  try-catch with chaining to error handler on error.
 */
function errorWrap(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    }
    catch (err) {
      next(err);
    }
  };
}
  

/*************************** Mapping Errors ****************************/

const ERROR_MAP = {
  EXISTS: CONFLICT,
  NOT_FOUND: NOT_FOUND
}

/** Map domain/internal errors into suitable HTTP errors.  Return'd
 *  object will have a "status" property corresponding to HTTP status
 *  code.
 */
function mapError(err) {
	if(err.errorCode !== 'NOT_FOUND'){
		console.error(err);
	}
	return err.isDomain
	? { status: (ERROR_MAP[err.errorCode] || BAD_REQUEST),
	code: err.errorCode,
	message: err.message
	}
	: { status: SERVER_ERROR,
	code: 'INTERNAL',
	message: err.toString()
	};
}

/** Return base URL of req for path.
 *  Useful for building links; Example call: baseUrl(req, DOCS)
 */
function baseUrl(req, path='/') {
	const port = req.app.locals.port;
	const url = `${req.protocol}://${req.hostname}:${port}`;
	return url;
}

