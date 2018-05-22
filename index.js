#!/usr/bin/env node

const googleTrends = require("google-trends-api")
const date = require("date-and-time")
const _ = require("lodash")
const fs = require('fs')
const ArgumentParser = require('argparse').ArgumentParser
const Table = require('cli-table')
const HttpsProxyAgent = require('https-proxy-agent')

let ip_port// = "207.32.30.20:8080"
let proxy
if (ip_port) proxy = new HttpsProxyAgent('https://' + ip_port + '/')

/**
 * Single call to API
 * @param {*} options 
 */
async function _getKeywordsAndAverages(options) {
  try {
    let results = await googleTrends.interestOverTime(options)
    results = JSON.parse(results)
    let averages = results.default.averages

    while (averages.length < options.keywords.length) {
      averages.push(0)
    }
    let { keywords } = options
    averages = _.zip(options.keywords, averages)
    averages = averages.reduce((obj, keywordAndAverage) => {
      let keyword = keywordAndAverage[0]
      let average = keywordAndAverage[1]
      obj[keyword] = average
      return obj
    }, {})
    
    return averages
  } catch (err) {
    return Promise.reject(err)
  }
}

/**
 * Google API url does not accept more than 5 words,
 * does chunking and regrouping, making multiple calls see
 * `_getKeywordsAndAverages()`
 * @param {*} object 
 */
async function getKeywordsAndAverages(options){
  let { keywords } = options
  let keywordsGroups = _.chunk(keywords, 5)
  if (keywordsGroups.length > 1 && keywordsGroups[keywordsGroups.length - 1].length == 1) {
    keywordsGroups[keywordsGroups.length - 1].push(keywordsGroups[keywordsGroups.length-2].pop())
  }
  let allPromises = keywordsGroups.map(keywords => {  
    return _getKeywordsAndAverages(getQueryOptions(keywords))
  })
  try{
    let results = await Promise.all(allPromises)
    results = results.reduce((obj, chunkResult) => {
      return _.merge(obj, chunkResult)
    }, {})
    return results
  } catch(err) {
    return Promise.reject(err)
  }
}

const english = /^[A-Za-z0-9 ]*$/;

/**
 * Gets language code of given string(s)
 * @param {String[]|String} string 
 */
function getLanguageCode(string) {
  if (Array.isArray(string)) {
    string = string[0]
  }
  let language
  if (english.test(string)) {
    language = 'english'
  } else {
    language = 'chinese'
  }
  let languageCodes = {
    'english' : 'en',
    'chinese' : 'zh-CN'
  }
  return languageCodes[language]
}

function getQueryOptions(keywords) {
  let now =  new Date()
  let tenMonthsAgo = date.addMonths(now, -10)
  let startTime = tenMonthsAgo
  let endTime = now
  let geo = "SG"
  let language = getLanguageCode(keywords)

  let options = { hl: language, keyword: keywords, keywords, startTime, endTime, geo }
  if(typeof proxy != "undefined" && proxy) {
    options['agent'] = proxy
  }
  return options
}

async function _getRelatedTopics(options) {
  return new Promise(async (resolve, reject) => {
    googleTrends.relatedTopics(options, (err, results) => {
      if(err) { return reject(err) }
      results = JSON.parse(results)
      results = results.default.rankedList
      resolve(results)  
    })  
  })
}

/**
 * Queries are split and multiple calls are 
 * made to the API. See `_getRelatedTopics()`
 */
async function getRelatedTopics(options) {
  let keywords = options.keywords
  let relatedTopics = keywords.reduce((obj, keyword) => {
    let options = getQueryOptions(keyword)
    obj[keyword] = _getRelatedTopics(options)
    return obj
  }, {})

  try {
    await Promise.all(_.values(relatedTopics))
  } catch(err) {
    return Promise.reject(err)
  }

  for (key in relatedTopics) {
    let relatedToQuery = await relatedTopics[key]
    relatedToQuery = _.chain(relatedToQuery)
    .map(row => row['rankedKeyword'])
    .flatten()
    .map(item => item.topic.title)
    .value()
    relatedTopics[key] = relatedToQuery
  }

  let results = relatedTopics
  return results
}

/**
 * Single Call
 * @param {*} options 
 */
async function _getRelatedQueries(options) {
  return new Promise(async (resolve, reject) => {    
    googleTrends.relatedQueries(options, (err, results) => {
      if(err) { return reject(err) }
      results = JSON.parse(results)
      let relatedQueries = results.default.rankedList
      resolve(relatedQueries)
    })  
  })
}

async function getRelatedQueries(options) {
  let keywords = options.keywords
  let relatedQueries = keywords.reduce((obj, keyword) => {
    let options = getQueryOptions(keyword)
    obj[keyword] = _getRelatedQueries(options)
    return obj
  }, {})

  try {
    await Promise.all(_.values(relatedQueries))    
  } catch (err) {
    return Promise.reject(err)
  }

  for (key in relatedQueries) {
    let relatedToQuery = await relatedQueries[key]
    relatedToQuery = _.chain(relatedToQuery)
    .map(row => row['rankedKeyword'])
    .flatten()
    .map(item => item.query)
    .value()
    relatedQueries[key] = relatedToQuery
  }

  let results = relatedQueries
  return results
}

/**
 * Gets averages, related queries and related topics for the keywords
 * @param {*} keywords 
 */
async function getTrend(keywords){
  let options = getQueryOptions(keywords)
  try {
    let averages = await getKeywordsAndAverages(options)
    let relatedQueries = await getRelatedQueries(options)
    let relatedTopics = await getRelatedTopics(options)
    
    options.relatedTopics = relatedTopics
    options.averages = averages
    options.relatedQueries = relatedQueries
    return options
  } catch (err) {
    err.options = options
    return Promise.reject(err)
  }
}

function displayTrendTable(trend) {
  let { keywords, averages, relatedQueries, relatedTopics } = trend
  let table = new Table({
      head: ["s/n", "keyword", "average", "related queries", "related topics"]
  })
  
  _.chain(keywords).map((keyword, index) => {
    let row = [keyword, 
      averages[keyword], 
      relatedQueries[keyword].slice(0, 10).join("\n"), 
      relatedTopics[keyword].slice(0, 10).join("\n")]
    return row
  })
  .sortBy(item => item[1])
  .value()
  .reverse()
  .map((row, index) => {
    return [index + 1].concat(row)
  })
  .forEach(row => table.push(row))

  console.log(table.toString())
}

function displayTrend(trend){
  let {keywords, startTime, endTime, geo} = trend

  console.log("Keywords: ", keywords.join(", "), "\n")
  _.chunk(keywords, 5).forEach((keywords, index) => {
    let url = "https://trends.google.com/trends/explore?"

    url += "date=" + date.format(startTime, 'YYYY-MM-DD')
    url += " " + date.format(endTime, 'YYYY-MM-DD')
    url += "&geo=SG&q=" + keywords.join(",")
    url = encodeURI(url)
    console.log("URL " + (index + 1) + " : ", url)
  })
  
  console.log("\n")

  displayTrendTable(trend)
  console.log("*****************************************************", "\n")
}

async function readFile(filename) {
  return new Promise((resolve, reject) => {
    fs.readFile(filename, (err, data) => {      
      if(err) return reject(err)
      data = data.toString().trim()
      resolve(data)
    })
  })
}

async function getQueriesLines(filename) {
  return new Promise(async (resolve, reject) => {
    let data = await readFile(filename)
    
    let lines = data.split("\n")
    lines = _.filter(lines, line => line.length > 0 && line.charAt(0) != "#")
    
    let queries = lines.map(line => {
      return line.split(",").map(str => str.trim())
    })
    resolve(queries)
  })
}

// Use this to do some manipulation of query lines like
// Generating combo of strings
function manipulateQueryLines(queryLines) {
  one = queryLines[0]
  two = queryLines[1]
  combo = one.map(function(a1){
    return two.map(function(a2){
      return a1 + a2
    })
  })

  console.log(_.flatten(combo).join(", "))
}

async function main(){
  let parser = new ArgumentParser({
    version: '0.0.1',
    addHelp:true,
    description: 'GTRENDS'
  })
  parser.addArgument(
    [ '-f', '--file' ],
    {
      help: 'File path',
      required: true
    }
  )
  let { file } = parser.parseArgs()
  let filename = file
  let queryLines = await getQueriesLines(filename)
  let trends

  try {
    trends = await Promise.all(queryLines.map(getTrend))
    trends.forEach((trend) => {
      displayTrend(trend)
    })
  } catch (err) {
    if (err.requestBody && err.requestBody.includes('too many')) {
      return console.log("Too many requests")
    }
    return console.log("Cannot get trends", err)
  }

  // All queries
  console.log("All Queries", "\n")
  aggregateTrends = trends.reduce((obj, trend) => {
    let {keywords, averages, relatedTopics, relatedQueries} = trend
    obj['keywords'] = obj['keywords'] || []
    obj['keywords'] = obj['keywords'].concat(keywords)
    obj['averages'] = obj['averages'] || {}
    obj['averages'] = _.merge(obj['averages'], averages)
    obj['relatedTopics'] = obj['relatedTopics'] || {}
    obj['relatedTopics'] = _.merge(obj['relatedTopics'], relatedTopics)
    obj['relatedQueries'] = obj['relatedQueries'] || {}
    obj['relatedQueries'] = _.merge(obj['relatedQueries'], relatedQueries)
    return obj
  }, {})
  displayTrendTable(aggregateTrends)
  // manipulateQueryLines(queryLines)
}

main()
