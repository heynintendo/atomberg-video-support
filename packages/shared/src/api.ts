export interface HealthResponse {
  status: 'ok';
  service: string;
  time: string;
}

export interface ReadyResponse {
  status: 'ready' | 'unready';
  db: 'up' | 'down';
}
