use uuid::Uuid;

pub struct MultipartMixed {
    boundary: String,
    parts: Vec<Part>,
}

struct Part {
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

impl MultipartMixed {
    pub fn new() -> Self {
        Self {
            boundary: Uuid::new_v4().to_string(),
            parts: Vec::new(),
        }
    }

    pub fn add_part(&mut self, body: &str, content_type: &str, extra_headers: Vec<(&str, &str)>) {
        let mut headers = vec![
            ("content-type".to_string(), content_type.to_string()),
        ];
        for (k, v) in extra_headers {
            headers.push((k.to_string(), v.to_string()));
        }
        self.parts.push(Part {
            headers,
            body: body.as_bytes().to_vec(),
        });
    }

    pub fn content_type(&self) -> String {
        format!("multipart/mixed; boundary={}", self.boundary)
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut out = Vec::new();
        for part in &self.parts {
            out.extend_from_slice(format!("--{}\r\n", self.boundary).as_bytes());
            for (k, v) in &part.headers {
                out.extend_from_slice(format!("{}: {}\r\n", k, v).as_bytes());
            }
            out.extend_from_slice(b"\r\n");
            out.extend_from_slice(&part.body);
            out.extend_from_slice(b"\r\n");
        }
        out.extend_from_slice(format!("--{}--\r\n", self.boundary).as_bytes());
        out
    }
}
