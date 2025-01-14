const retry = require('../helper/retry');
const axios = require('axios')
const pageResults = require('graph-results-pager');

const graph_endpoint = 'https://graphnode.horizonprotocol.com/subgraphs/name/horizonprotocol-team/horizon'
const price_feed_endpoint = 'https://api.coingecko.com/api/v3/simple/price?ids=horizon-protocol&vs_currencies=usd'

async function fetchHoldersCollateral() {
    // Uses graph protocol to run through SNX contract. Since there is a limit of 100 results per query
    // we can use graph-results-pager library to increase the limit.
    return pageResults({
        api: graph_endpoint, // Need to update when moving to a subgraph hosted service
        max: 20000,         // Currently there are around 8k holders.This can be updated
        query: {
            entity: 'snxholders',
            selection: {
                orderBy: 'collateral',
                orderDirection: 'desc',
            },
            properties: [
                'id', // the address of the holder
                'block', // the block this entity was last updated in
                'timestamp', // the timestamp when this entity was last updated
                'collateral', // Synthetix.collateral (all collateral the account has, including escrowed )
                'balanceOf', // HZN balance in their wallet
                'transferable', // All non-locked HZN
                'initialDebtOwnership', // Debt data from SynthetixState, used to calculate debtBalance
                'debtEntryAtIndex', // Debt data from SynthetixState, used to calculate debtBalance
                'claims', // Total number of claims ever performed
                'mints', // Total number of mints ever performed (issuance of zUSD)
            ],
        },
    })
        .then(results =>
            results.map(
                ({
                    id,
                    collateral,
                    transferable,
                    debtEntryAtIndex,
                    initialDebtOwnership,
                    block
                }) => ({
                    address: id,
                    collateral: collateral ? collateral / 1e18 : null,
                    transferable: transferable ? transferable / 1e18 : null,
                    debtEntryAtIndex: debtEntryAtIndex ? debtEntryAtIndex / 1e27 : null,
                    initialDebtOwnership: initialDebtOwnership ? initialDebtOwnership / 1e27 : null,
                    block: Number(block)
                }),
            ),
        )
        .catch(err => console.error(err));
}

async function tvl() {
    const holders = await fetchHoldersCollateral();       // Get all holders and their collateral

    const { data } = await retry(async bail => await axios.get(price_feed_endpoint))
    const hznPrice = data['horizon-protocol'].usd;
    
    var totalCollateral = 0;
    for (const {
        collateral,
        debtEntryAtIndex,
        initialDebtOwnership,
    } of holders) {
        if (!collateral || !debtEntryAtIndex || !initialDebtOwnership) continue;        // Consider wallets only who have a debtEntry

        totalCollateral += Number(collateral * hznPrice)        // sum of every user's collateral

    }
    console.log("Total TVL", totalCollateral);
    return totalCollateral;
}

module.exports = {
    tvl
}