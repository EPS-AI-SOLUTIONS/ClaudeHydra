use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AnthropicModel {
    pub id: String,
    pub created_at: String,
    pub display_name: String,
    #[serde(rename = "type")]
    pub model_type: String,
}

#[derive(Debug, Deserialize)]
struct ModelsResponse {
    data: Vec<AnthropicModel>,
    #[allow(dead_code)]
    has_more: bool,
}

#[tauri::command]
pub async fn anthropic_list_models(api_key: String) -> Result<Vec<AnthropicModel>, String> {
    if api_key.is_empty() {
        return Err("API key is required".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .get("https://api.anthropic.com/v1/models")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Anthropic: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Anthropic API error {}: {}", status, body));
    }

    let models: ModelsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Anthropic response: {}", e))?;

    Ok(models.data)
}
