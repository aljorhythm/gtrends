#!/usr/bin/env node

const date = require("date-and-time")
const ArgumentParser = require('argparse').ArgumentParser
const HttpsProxyAgent = require('https-proxy-agent')
const trends = require('./trends.js')
const queries = require('./queries.js')
const _ = require('lodash')
const output = require('./output.js')

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

/**
 * Gets averages, related queries and related topics for the keywords
 * @param {*} keywords 
 */
async function getTrend(keywords){
  let options = getQueryOptions(keywords)
  let results = {keywords}
  try {
    results.averages = await trends.getKeywordsAndAverages(options)
  } catch (e) {
    e.trend = 'average'
    throw e
  }  
  try {
    results.relatedQueries = await trends.getRelatedQueries(options)
  } catch(e) {
    e.trend = 'relatedQueries'
    throw e
  }
  results.relatedTopics = results.relatedTopics
  return _.assign(results, options)  
  try {
    results.relatedTopics = await trends.getRelatedTopics(options)
  } catch (e) {
    e.trend = 'relatedTopics'
    throw e
  }
}

function getCliArgs() {
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
  parser.addArgument(
    [ '-p', '--proxy' ],
    {
      help: 'Proxy',
      required: false
    }
  )
  parser.addArgument(
    [ '-o', '--output' ],
    {
      help: 'Output file path',
      required: false
    }
  )
  let args = parser.parseArgs()
  args.filename = args.file
  args.outputFile = args.output
  args.proxyAddress = args.proxy
  return args
}

function getQueryOptions(keywords) {
  let now =  new Date()
  let tenMonthsAgo = date.addMonths(now, -10)
  let startTime = tenMonthsAgo
  let endTime = now
  let geo = "SG"
  let language = getLanguageCode(keywords)

  let options = { hl: language, keyword: keywords, startTime, endTime, geo }
  if(typeof proxy != "undefined" && proxy) {
    options['agent'] = proxy
  }
  return options
}

async function main(){
  let args = getCliArgs()
  let { filename, proxyAddr, outputFile } = args
  let proxy
  if (proxyAddr) proxy = new HttpsProxyAgent('https://' + proxyAddr + '/')
  let queryLines = await queries.getListOfQueries(filename)
  queryLines = queryLines.slice(4, 5)
  try {
    let trends = await Promise.all(queryLines.map(getTrend))
    output(trends, outputFile)  
  } catch (err) {
    if (err.requestBody && err.requestBody.includes('too many')) {
      return console.error("Too many requests")
    }
    return console.error("Cannot get trends", err)
  }
}

main()
