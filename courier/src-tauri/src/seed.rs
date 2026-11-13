use crate::models::{BodyType, Collection, Environment, KvItem, Method, Request};

pub fn collections() -> Vec<Collection> {
    let mut get_post = Request {
        name: "Get Post".into(),
        method: Method::Get,
        url: "{{baseUrl}}/posts/1".into(),
        ..Default::default()
    };
    get_post.headers = vec![KvItem::pair("Accept", "application/json")];

    let mut create_post = Request {
        name: "Create Post".into(),
        method: Method::Post,
        url: "{{baseUrl}}/posts".into(),
        ..Default::default()
    };
    create_post.headers = vec![KvItem::pair("Content-Type", "application/json")];
    create_post.body.kind = BodyType::Json;
    create_post.body.raw =
        "{\n  \"title\": \"Hello from Courier\",\n  \"body\": \"Created by a Courier request.\",\n  \"userId\": 1\n}"
            .into();

    let mut list_todos = Request {
        name: "List Todos".into(),
        method: Method::Get,
        url: "{{baseUrl}}/todos?_limit=5&userId={{userId}}".into(),
        ..Default::default()
    };
    list_todos.params = vec![KvItem::pair("_limit", "5"), KvItem::pair("userId", "{{userId}}")];

    vec![Collection {
        name: "Examples".into(),
        requests: vec![get_post, create_post, list_todos],
        ..Default::default()
    }]
}

pub fn environments() -> Vec<Environment> {
    vec![Environment {
        name: "JSONPlaceholder".into(),
        variables: vec![
            KvItem::pair("baseUrl", "https://jsonplaceholder.typicode.com"),
            KvItem::pair("userId", "1"),
        ],
        ..Default::default()
    }]
}
