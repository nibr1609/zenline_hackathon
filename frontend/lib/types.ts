export interface Competitor {
  reference: string | null
  competitor_retailer: string | null
  competitor_product_name: string | null
  competitor_url: string | null
  competitor_price: number | null
  image_url: string | null
  rerank_position: number | null
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
