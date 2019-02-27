const Table = require('cli-table')
const fs = require('fs-extra')
const _ = require("lodash")
const date = require("date-and-time")

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

module.exports = function (trends, outputFile) {
  trends.forEach((trend) => {
    displayTrend(trend)
  })
  // All queries
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
}