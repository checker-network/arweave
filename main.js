/* global Arweave */

import './vendor/arweave.js'
import pTimeout, { TimeoutError } from './vendor/p-timeout.js'

const IP_ADDRESS_REGEX = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/
const ONE_MINUTE = 60_000
const MEASUREMENT_DELAY = ONE_MINUTE
const UPDATE_NODES_DELAY = 10 * ONE_MINUTE
const RANDOM_TRANSACTION_IDS = [
  'sHqUBKFeS42-CMCvNqPR31yEP63qSJG3ImshfwzJJF8',
  'vexijI_Ij0GfvWW1wvewlz255_v1Ni7dk9LuQdbi6yw',
  '797MuCtgdgiDrglJWczz2lMZkFkXInC88Htqv-JuOUQ',
  'XO6w3W8dYZnioq-phAbq8SG1Px5kci_j3RmcChS05VY',
  's2aJ5tzVEcSxITsq2G5cZnAhBDplCSkARJEOuNMZ31o'
]
const PING_TIMEOUT = 10_000
const RETRIEVE_TIMEOUT = 10_000

const getNodes = async () => {
  // TODO: Find a publicly documented API
  const docs = []
  let maxPage = Infinity
  for (let page = 0; page < maxPage; page++) {
    const res = await fetch(
      `https://api.viewblock.io/arweave/nodes?page=${page + 1}&network=mainnet`,
      {
        headers: {
          Origin: 'https://viewblock.io'
        }
      }
    )
    const body = await res.json()
    if (maxPage === Infinity) {
      maxPage = body.pages
    }
    docs.push(...body.docs)
  }
  const nodes = [
    {
      host: 'arweave.net',
      port: 443,
      protocol: 'https'
    },
    ...docs
      .map(doc => doc.id)
      .filter(Boolean)
      .map(addr => {
        const [host, port] = addr.split(':')
        const protocol = IP_ADDRESS_REGEX.test(host) ? 'http' : 'https'
        return {
          host,
          port: port
            ? Number(port)
            : protocol === 'http' ? 80 : 443,
          protocol
        }
      })
  ]
  console.log(`Found ${nodes.length} nodes`)
  return nodes
}

const ping = async node => {
  const partialMeasurement = {
    alive: false,
    timeout: null,
    ttfbMs: null
  }
  const start = new Date()
  try {
    const res = await fetch(
      `${node.protocol}://${node.host}:${node.port}/`,
      {
        signal: AbortSignal.timeout(PING_TIMEOUT)
      }
    )
    if (!res.ok) {
      throw new Error()
    }
  } catch (err) {
    if (err.name === 'TimeoutError') {
      partialMeasurement.timeout = true
    }
    return partialMeasurement
  }
  partialMeasurement.alive = true
  partialMeasurement.ttfbMs = new Date().getTime() - start.getTime()
  return partialMeasurement
}

const retrieve = async node => {
  const arweave = Arweave.init(node)
  const txId = RANDOM_TRANSACTION_IDS[Math.floor(Math.random() * RANDOM_TRANSACTION_IDS.length)]
  const partialMeasurement = {
    txId,
    alive: false,
    timeout: null,
    durationMs: null
  }
  const start = new Date()
  try {
    await pTimeout(
      arweave.chunks.downloadChunkedData(txId),
      { milliseconds: RETRIEVE_TIMEOUT }
    )
  } catch (err) {
    if (err instanceof TimeoutError) {
      partialMeasurement.timeout = true
    }
    return partialMeasurement
  }
  partialMeasurement.alive = true
  partialMeasurement.durationMs = new Date().getTime() - start.getTime()
  return partialMeasurement
}

const measure = async node => {
  return {
    node,
    ping: await ping(node),
    retrieval: await retrieve(node)
  }
}

const submit = async measurement => {
  const res = await fetch('https://arweave.checker.network/measurements', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(measurement)
  })
  if (!res.ok) {
    throw new Error(`Failed to submit measurement (status=${res.status})`, {
      cause: new Error(await res.text().catch(() => null))
    })
  }
}

let nodes = await getNodes()

;(async () => {
  while (true) {
    await new Promise(resolve => setTimeout(resolve, UPDATE_NODES_DELAY))
    try {
      nodes = await getNodes()
    } catch (err) {
      console.error('Error updating nodes')
      console.error(err)
    }
  }
})()

while (true) {
  const measurement = await measure(
    nodes[Math.floor(Math.random() * nodes.length)]
  )
  console.log(measurement)
  try {
    await submit(measurement)
  } catch (err) {
    console.error('Error submitting measurement')
    console.error(err)
  }
  console.log(`Waiting ${MEASUREMENT_DELAY / 1_000} seconds...`)
  await new Promise(resolve => setTimeout(resolve, MEASUREMENT_DELAY))
}
