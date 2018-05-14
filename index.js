#!/usr/bin/env node

const googleTrends = require("google-trends-api")
const date = require("date-and-time")
const _ = require("lodash")
const ctable = require("console.table")
const fs = require('fs')
const ArgumentParser = require('argparse').ArgumentParser;

/**
 * Google API url does not accept more than 5 words,
 * does chunking and regrouping
 * @param {*} object 
 */
async function getKeywordsAndAverages(object){
  let { keywords, startTime, endTime } = object
  let keywordsGroups = _.chunk(keywords, 5);
  let allPromises = keywordsGroups.map(keywords => {
    return new Promise((resolve, reject) => {
      googleTrends.interestOverTime({startTime: startTime, endTime: endTime, keyword: keywords, geo: "SG"}, (err, results) => {
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

async function displayTrend(keywords){
  return new Promise(async (resolve, reject) => {
    let now =  new Date()
    let tenMonthsAgo = date.addMonths(now, -10)
    let startTime = tenMonthsAgo
    let endTime = now
  
    let keywordsAndAverages = await getKeywordsAndAverages({ keywords, startTime, endTime })
  
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
  })
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

async function getQueries(filename) {
  return new Promise(async (resolve, reject) => {
    let data = await readFile(filename)
    
    let lines = data.split("\n")
    let queries = lines.map(line => {
      return line.split(",").map(str => str.trim())
    })
    resolve(queries)
  })
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
  let queries = await getQueries(filename)
  queries.forEach(keywords => {
    displayTrend(keywords)
  });
}

main()
