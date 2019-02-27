const _ = require("lodash")
const csv = require('csv-array')
const fs = require('fs-extra')
const fileExtension = require('file-extension')

async function parseQueriesFromCSV(filepath) {
  return new Promise((resolve, reject) => {
    csv.parseCSV(filepath, (data) => {
      data = data.map(row => row.map(text => text.trim()))
      resolve(data)
    }, false)
  })
}

async function getListOfQueries(filepath) {  
  let ext = fileExtension(filepath)
  return await parseQueriesFromCSV(filepath)
}

module.exports = {
  getListOfQueries
}