#!/usr/bin/env node

const googleTrends = require("google-trends-api")
const date = require("date-and-time")
const _ = require("lodash")
const fs = require('fs')
const ArgumentParser = require('argparse').ArgumentParser;

/**
 * Google API url does not accept more than 5 words,
 * does chunking and regrouping
 * @param {*} object 
 */
async function getKeywordsAndAverages(options){
  let keywords = options.keyword
  let keywordsGroups = _.chunk(keywords, 5);
  let allPromises = keywordsGroups.map(keywords => {
    return new Promise((resolve, reject) => {
      options.keyword = keywords
      googleTrends.interestOverTime(options, (err, results) => {
        if(err){ return reject(err) }
        results = JSON.parse(results)
        let averages = results.default.averages
    
        let keywordsAndAverages = _.zip(keywords, averages)
        resolve(keywordsAndAverages)
      })
    })
  })
  return Promise.all(allPromises).then((results, err) => {
    if(err) return reject(err)
    resultsRegrouped = _.chain(results)
    .flatten()
    .concat()
    .sortBy([(item) => { return item[1] }]).reverse()
    .value()
    
    return resultsRegrouped
  })
}

function getQueryOptions(keywords) {

  let now =  new Date()
  let tenMonthsAgo = date.addMonths(now, -10)
  let startTime = tenMonthsAgo
  let endTime = now
  let geo = "SG"

  return { keyword: keywords, keywords, startTime, endTime, geo }
}

async function getTrend(keywords){
  return new Promise(async (resolve, reject) => {
    let options = getQueryOptions(keywords)
    options.keywordsAndAverages = await getKeywordsAndAverages(options)
    resolve(options)
  })
}

async function getRelatedQueries(keywords){
  return new Promise(async (resolve, reject) => {
    let options = getQueryOptions(keywords)   
    
    googleTrends.relatedQueries(options, (err, results) => {
      if(err) return reject(err)
      results = JSON.parse(results)
      options.relatedQueries = results.default.rankedList
      resolve(options)  
    })  
  })
}

async function displayTrend(trend){
  let {keywords, keywordsAndAverages, startTime, endTime, geo} = trend
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
  console.table(["keyword", "average"], keywordsAndAverages)
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
    });
  });

  console.log(_.flatten(combo).join(", "))
}

async function main(){
  let parser = new ArgumentParser({
    version: '0.0.1',
    addHelp:true,
    description: 'GTRENDS'
  });
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
  let trends = queryLines.map(getTrend)
  trends = await Promise.all(trends)
  trends.forEach(displayTrend)

  // All queries
  console.log("All Queries", "\n")
  aggregateTrends = trends.map(trend => {
    let {keywords, keywordsAndAverages} = trend
    return keywordsAndAverages
  })
  aggregateTrends = _.chain(aggregateTrends)
  .flatten()
  .sortBy(item => item[1])
  .value()
  .reverse()
  aggregateTrends = aggregateTrends.map(async (trend) => {
    let keyword = trend[0]
    result = await getRelatedQueries(trend[0])
    relatedQueries = _.flatMap(result.relatedQueries, item => item.rankedKeyword)
    .map(query => query.query)
    .slice(0, 10)
    .join("\n")
    trend.push(relatedQueries)
    return trend
  })
  aggregateTrends = await Promise.all(aggregateTrends)

  var Table = require('cli-table') 
  var table = new Table({
      head: ["Query", "Average", "Related Queries"]
  })
  aggregateTrends.forEach(row => table.push(row))
  
  console.log(table.toString())
  return console.log(aggregateTrends)
  
  console.table(["Term", "Average"], aggregateTrends)

  console.log("*****************************************************", "\n")

  // Related queries
  console.log("Related Queries", '\n')
  
  relatedQueries = aggregateTrends.map(trend => {
    return getRelatedQueries(trend[0])
  })
  relatedQueries = await Promise.all(relatedQueries)

  relatedQueries = relatedQueries.map(async result => {
    result = await getRelatedQueries(trend[0])
    queries = _.flatMap(result.relatedQueries, item => item.rankedKeyword)
    .map(query => query.query)
    .slice(0, 10)
    .join("\n")
    return [result.keywords, queries]
  })

  relatedQueries = _.sortBy(relatedQueries, item => item[1].length).reverse()

  

  // manipulateQueryLines(queryLines)
}

main()
