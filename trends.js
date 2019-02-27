
const googleTrends = require("google-trends-api")
const _ = require("lodash")

/**
 * Single call to API
 * @param {*} options 
 */
async function _getKeywordsAndAverages(options) {
  try {
    let results = await googleTrends.interestOverTime(options)
    results = JSON.parse(results)
    let averages = results.default.averages

    while (averages.length < options.keyword.length) {
      averages.push(0)
    }
    let { keywords } = options
    averages = _.zip(options.keyword, averages)
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
    options.keyword = keywords
    return _getKeywordsAndAverages(options)
  })
  try{
    let results = await Promise.all(allPromises)
    results = results.reduce((obj, chunkResult) => {
      return _.merge(obj, chunkResult)
    }, {})
    return results
  } catch(err) {
    throw err
  }
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
  let keywords = options.keyword
  let relatedTopics = keywords.reduce((obj, keyword) => {
    options.keyword = keywords
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
  let keywords = options.keyword
  let relatedQueries = keywords.reduce((obj, keyword) => {
    options.keyword = keywords
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

module.exports = {
  getRelatedQueries, getRelatedTopics, getKeywordsAndAverages
}