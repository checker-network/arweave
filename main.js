const ipAddressRegex = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/

const getNodes = async () => {
  // TODO: Find a publicly documented API
  const res = await fetch(
    'https://api.viewblock.io/arweave/nodes?page=1&network=mainnet',
    {
      headers: {
        'Origin': 'https://viewblock.io'
      }
    }
  )
  const body = await res.json()
  return [
    {
      host: 'arweave.net',
      port: 443,
      protocol: 'https'
    },
    ...body.docs
      .map(d => d.id)
      .sort()
      .map(addr => {
        const [host, port] = addr.split(':')
        const protocol = ipAddressRegex.test(host) ? 'http' : 'https'
        return {
          host,
          port: port
            ? Number(port)
            : protocol === 'http' ? 80 : 443,
          protocol
        }
      })
  ]
}

const measure = async node => {
  const measurement = {
    node,
    alive: false,
    timeout: false,
    ttfbMs: null
  }
  const start = new Date()
  try {
    const res = await fetch(
      `${node.protocol}://${node.host}:${node.port}/`,
      {
        signal: AbortSignal.timeout(10_000)
      }
    )
    if (!res.ok) {
      throw new Error()
    }
  } catch (err) {
    if (err.name === 'TimeoutError') {
      measurement.timeout = true
    }
    return measurement
  }
  measurement.alive = true
  measurement.ttfbMs = new Date().getTime() - start.getTime()
  return measurement
}

const nodes = await getNodes()
console.log(`Found ${nodes.length} nodes`)

console.log(
  await measure(
    nodes[Math.floor(Math.random() * nodes.length)]
  )
)
