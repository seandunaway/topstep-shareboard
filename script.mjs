let elements = get_elements()

let board_filename = get_board_filename()
let board = await fetch_board(board_filename)

let trades = await fetch_trades(board)
let stats = calculate_stats(trades)
let stats_grid = create_stats_grid(elements.stats, stats)
let trades_grid = create_trades_grid(elements.trades, trades)

let default_symbol = 'F.US.EP'
let symbol_map = get_symbol_map()
let symbol_select = populate_symbol_select(elements.symbol_select, symbol_map)

let quotes = await fetch_quotes(default_symbol)
let chart = create_chart(elements.chart, quotes, trades, default_symbol)

function get_elements () {
	let ids = ['stats', 'symbol_select', 'chart', 'trades']

	/** @type {elements} */
	let elements = {}

	for (let id of ids) {
		let element = document.getElementById(id)
		if (!element)
			continue

		elements[id] = element
	}

	return elements
}

function get_board_filename () {
	let base_path = './boards/'
	let filename_chunk = 'default'

	let params = window.location.search.slice(1)
	if (params)
		filename_chunk = params

	let board_filename = `${base_path}${filename_chunk}.json`

	return board_filename
}

async function fetch_board (/** @type {string} */ board_filename) {
	let response = await fetch(board_filename)
	let response_object = await response.json()

	let start_date = new Date(response_object.start_date)
	let end_date = new Date(response_object.end_date)

	/** @type {board} */
	let board = {
		name: response_object.name,
		allow_practice: response_object.allow_practice,
		allow_combine: response_object.allow_combine,
		allow_xfa: response_object.allow_xfa,
		allow_multiple: response_object.allow_multiple,
		start_date: start_date,
		end_date: end_date,
		shares: response_object.shares,
	}

	return board
}

async function fetch_trades (/** @type {board} */ board) {
	let url = 'https://userapi.topstepx.com/Trade/range'

	/** @type {trades} */
	let trades = {}

	for (let user in board.shares) {
		if (!trades[user])
			trades[user] = []

		let shares = board.shares[user]

		for (let share_id of shares) {
			let payload = {
				tradingAccountId: share_id,
				start: board.start_date.toISOString(),
				end: board.end_date.toISOString(),
			}

			/** @type {Response} */
			let response
			let response_array

			try {
				response = await fetch(url, {
					method: 'post',
					headers: {'content-type': 'application/json'},
					body: JSON.stringify(payload),
				})

				response_array = await response.json()
			} catch (error) {
				console.error('fetch_data:', user, share_id)
				continue
			}

			let scale_count = 0

			for (let response_trade of response_array) {
				let start_date = new Date(response_trade.createdAt)
				if (start_date < board.start_date)
					continue

				let end_date = new Date(response_trade.exitedAt)
				if (end_date > board.end_date)
					continue

				let pnl = (response_trade.pnL - response_trade.fees) / Math.abs(response_trade.positionSize)

				scale_count++

				let previous_trade = trades[user].at(-1)
				if (previous_trade && start_date < previous_trade.end_date) {
					previous_trade.entry_price = (previous_trade.entry_price * scale_count + response_trade.entryPrice) / (scale_count + 1)
					previous_trade.exit_price = (previous_trade.exit_price * scale_count + response_trade.exitPrice) / (scale_count + 1)
					previous_trade.pnl = (previous_trade.pnl * scale_count + pnl) / (scale_count + 1)

					continue
				}

				scale_count = 0

				let trade = {
					symbol: response_trade.symbolId,
					start_date: start_date,
					end_date: end_date,
					entry_price: response_trade.entryPrice,
					exit_price: response_trade.exitPrice,
					pnl: pnl,
				}

				trades[user].push(trade)
			}
		}
	}

	return trades
}

function calculate_stats (/** @type {trades} */ trades) {
	/** @type {stats} */
	let stats = {}

	for (let user in trades) {
		let won = 0
		let lost = 0
		let profit = 0
		let loss = 0

		for (let trade of trades[user]) {
			if (trade.pnl >= 0) {
				won++
				profit += trade.pnl
			} else {
				lost++
				loss += Math.abs(trade.pnl)
			}
		}

		let number_of_trades = trades[user].length
		let total = won + lost
		let win_rate = div(won, total)
		let average_profit = div(profit, won)
		let average_loss = div(loss, lost)
		let reward_risk = div(average_profit, average_loss)
		let expectancy = (win_rate * reward_risk) - ((1 - win_rate) * 1)
		let pnl = profit - loss
		let average_pnl = div(pnl, total)

		stats[user] = {
			number_of_trades,
			win_rate,
			average_profit,
			average_loss,
			reward_risk,
			expectancy,
			average_pnl,
			pnl,
		}
	}

	return stats
}

async function create_stats_grid (/** @type {HTMLElement} */ element, /** @type {stats} */ stats) {
	let data = []

	for (let user in stats) {
		let stat = stats[user]
		data.push([
			user,
			stat.number_of_trades,
			stat.win_rate,
			stat.average_profit,
			stat.average_loss,
			stat.reward_risk,
			stat.expectancy,
			stat.average_pnl,
			stat.pnl,
		])
	}

	// @ts-ignore
	let grid = new gridjs.Grid({
		columns: [
			{name: 'user'},
			{name: '#'},
			{name: 'win rate', formatter:  p},
			{name: 'average profit', formatter:  c},
			{name: 'average_loss', formatter:  c},
			{name: 'r', formatter:  f},
			{name: 'expectancy', formatter:  f},
			{name: 'average pnl', formatter:  c},
			{name: 'total pnl', formatter:  c},
		],
		data: data,
		pagination: {
			buttonsCount: 0,
			limit: 25,
			summary: false,
		},
		search: true,
		sort: true,
	})

	grid.render(element)

	return grid
}

async function create_trades_grid (/** @type {HTMLElement} */ element, /** @type {trades} */ trades) {
	let data = []

	for (let user in trades) {
		for (let trade of trades[user]) {
			data.push([
				user,
				trade.symbol,
				trade.start_date,
				trade.end_date,
				trade.entry_price,
				trade.exit_price,
				trade.pnl,
			])
		}
	}

	// @ts-ignore
	let grid = new gridjs.Grid({
		columns: [
			{ name: 'user'},
			{ name: 'symbol'},
			{ name: 'start', formatter: d},
			{ name: 'end', formatter: d},
			{ name: 'entry', formatter: f},
			{ name: 'exit', formatter: f},
			{ name: 'pnl', formatter: c},
		],
		data: data,
		pagination: {
			buttonsCount: 0,
			limit: 25,
			summary: false,
		},
		search: true,
		sort: true,
	})

	grid.render(element)

	return grid
}

function get_symbol_map () {
	/** @type {symbol_map} */
	let symbol_map = {
		'F.US.EP': 'ES=F',
		'F.US.MES': 'ES=F',
		'F.US.ENQ': 'NQ=F',
		'F.US.MNQ': 'NQ=F',
		'F.US.GCE': 'GC=F',
		'F.US.MGC': 'GC=F',
		'F.US.CLE': 'CL=F',
	}

	return symbol_map
}

function populate_symbol_select (/** @type {HTMLElement} */ element, /** @type {symbol_map} */ symbol_map) {
	if (!(element instanceof HTMLSelectElement))
		return

	for (let symbol in symbol_map)
		element.options.add(new Option(symbol, symbol))

	return element
}

async function fetch_quotes (/** @type {string} */ symbol) {
	let proxy_url = decodeURIComponent('%68%74%74%70%3A%2F%2F%64%65%76%65%6C%2E%73%65%61%6E%64%75%6E%61%77%61%79%2E%63%6F%6D%3A%38%38%38%38%2F')
	let base_url = 'https://query1.finance.yahoo.com/v8/finance/chart/'

	let symbol_map = get_symbol_map()
	symbol = symbol_map[symbol]

	let interval = '1m'
	let range = '5d'

	let url = `${proxy_url}${base_url}${symbol}?&interval=${interval}&range=${range}`

	/** @type {Response} */
	let response
	let response_object
	let result

	try {
		response = await fetch(url)
		response_object = await response.json()

		result = response_object.chart.result[0]
	} catch (error) {
		console.error('fetch_market')
	}

	/** @type {quotes} */
	let quotes = []

	for (let i = 0; i < result?.timestamp?.length; i++) {
		let date = new Date(result.timestamp[i] * 1000)
		let price = result.indicators.quote[0].close[i]
		if (!price)
			continue

		let quote = {
			date: date,
			price: price,
		}

		quotes.push(quote)
	}

	return quotes
}

function create_chart (/** @type {HTMLElement} */ element, /** @type {quotes} */ quotes, /** @type {trades} */ trades, /** @type {string} */ symbol) {
	// @ts-ignore
	let chart = echarts.init(element)

	let min_timestamp = Infinity
	let max_timestamp = -Infinity
	let min_quote = Infinity
	let max_quote = -Infinity

	let quotes_data = []

	for (let quote of quotes) {
		if (quote.date.getTime() < min_timestamp)
			min_timestamp = quote.date.getTime()

		if (quote.date.getTime() > max_timestamp)
			max_timestamp = quote.date.getTime()

		if (quote.price < min_quote)
			min_quote = quote.price

		if (quote.price > max_quote)
			max_quote = quote.price

		quotes_data.push([
			quote.date,
			quote.price,
		])
	}

	max_timestamp += 20 * 60 * 1000

	let trade_series = []

	for (let user in trades) {
		/** @type {any} */
		let winning_trades = []
		/** @type {any} */
		let losing_trades = []

		for (let trade of trades[user]) {
			// if (trade.symbol !== symbol)
			// 	continue

			if (trade.start_date.getTime() < min_timestamp)
				continue

			if (trade.end_date.getTime() > max_timestamp)
				continue

			if (trade.entry_price > max_quote)
				continue

			if (trade.entry_price < min_quote)
				continue

			let target

			if (trade.entry_price >= trade.exit_price)
				target = winning_trades
			else
				target = losing_trades

			target.push({value: [trade.start_date, trade.entry_price], pnl: trade.pnl})
			target.push({value: [trade.end_date, trade.exit_price], pnl: trade.pnl})
			target.push({value: [null, null], pnl: null})
		}

		let series_defaults = {
			name: user,
			type: 'line',
			emphasis: {focus: 'series'},
			connectNulls: false,
			lineStyle: {width: 4},
			symbol: 'circle',
			symbolSize: 12,
		}

		trade_series.push({
			...series_defaults,
			data: winning_trades,
			lineStyle: {color: '#50fa7b', width: 4},
		})

		trade_series.push({
			...series_defaults,
			data: losing_trades,
			lineStyle: {color: '#ff5555', width: 4},
		})
	}

	let default_zoom_start = quotes[quotes.length - 1].date.getTime() - 24 * 60 * 60 * 1000

	let options = {
		xAxis: {type: 'time', axisLabel: {color: 'gray'}, axisLine: false},
		yAxis: {type: 'value', axisLabel: {color: 'gray'}, min: 'dataMin', max: 'dataMax', position: 'right', splitLine: false},
		series: [{type: 'line', data: quotes_data, emphasis: {disabled: true}, lineStyle: {color: 'lightgray', width: 4}, showSymbol: false}, ...trade_series],
		dataZoom: [{startValue: default_zoom_start, endValue: max_timestamp}],
		grid: {top: 0, right: 0, bottom: 0, left: 0},
		legend: {show: true, backgroundColor: 'white', orient: 'vertical', type: 'scroll', top: 'middle', left: 0},
		tooltip: {trigger: 'item', formatter: function (/** @type {any} */ p) {return `<b>${p.seriesName}</b><br>${c(p.data.pnl)}`}},
	}

	chart.setOption(options)

	let chart_dom = chart.getDom()
	chart_dom.addEventListener('dblclick', function () {chart.dispatchAction({type: 'dataZoom', startValue: default_zoom_start, endValue: max_timestamp})})
	window.addEventListener('resize', function () {chart.resize()})

	return chart
}

function div (numerator = 0, denominator = 0) {
	return denominator !== 0 ? numerator / denominator : 0;
}

function c (currency = 0.00) {
	return '$' + currency.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})
}

function d (date = new Date()) {
	return date.toLocaleString()
}

function f (float = 0.00) {
	return float.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})
}

function n (number = 0) {
	return number.toLocaleString('en-US', {maximumFractionDigits: 0})
}

function p (percent = 0.00) {
	return (percent * 100).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + '%'
}

/**
 * @typedef {{
 * 	[id: string]: HTMLElement,
 * }} elements
 */

/**
 * @typedef {{
 * 	name: string,
 *	allow_practice: boolean,
 *	allow_combine: boolean,
 *	allow_xfa: boolean,
 *	allow_multiple: boolean,
 *	start_date: Date,
 *	end_date: Date,
 *	shares: {
 *		[user: string]: number[],
 *	},
 * }} board
 */

/**
 * @typedef {{
 * 	[user: string]: {
 * 		symbol: string,
 * 		start_date: Date,
 * 		end_date: Date,
 * 		entry_price: number,
 * 		exit_price: number,
 * 		pnl: number,
 * 	}[]
 * }} trades
 */

/**
 * @typedef {{
 * 	[user: string]: {
 * 		number_of_trades: number,
 * 		win_rate: number,
 * 		average_profit: number,
 * 		average_loss: number,
 * 		reward_risk: number,
 * 		expectancy: number,
 * 		average_pnl: number,
 * 		pnl: number,
 * 	}
 * }} stats
 */

/**
 * @typedef {Record<string, string>} symbol_map
 */

/**
 * @typedef {{
 * 	date: Date,
 * 	price: number,
 * }[]} quotes
 */
