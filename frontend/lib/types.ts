export interface Competitor {
  reference: string | null
  competitor_retailer: string | null
  competitor_product_name: string | null
  competitor_url: string | null
  competitor_price: number | null
  image_url: string | null
  rerank_position: number | null
  scraped?: boolean
}

export interface SearchResults {
  product_name: string
  user_price: number | null
  competitors: Competitor[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  results?: SearchResults
}

export interface ChatApiResponse {
  type: 'chat' | 'clarification' | 'results'
  message: string
  results: SearchResults | null
}

export interface ProductItem {
  reference: string
  name: string
  price: number | null
  retailer: string | null
  image_url: string | null
  scraped: boolean
  url: string | null
}

export interface ProductsResponse {
  items: ProductItem[]
  total: number
  page: number
  pages: number
}

export interface StatsResponse {
  total: number
  scraped: number
  database: number
}

export interface BackgroundTask {
  status: 'running' | 'done' | 'error'
  logs: string[]
  started_at: number
  output_file?: string
}
