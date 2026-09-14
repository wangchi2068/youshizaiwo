import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  ngram,
  buildDf,
  tfidfVector,
  cosine,
  VectorIndex,
} from "../src/roleplay/vector.ts";

test("normalize：剔除非汉字/数字/字母，转小写", () => {
  assert.equal(normalize("Hello 都市！仙修??"), "hello都市仙修");
  assert.equal(normalize("会诊记录：只收病程"), "会诊记录只收病程");
});

test("ngram：bigram 切分正确，短文本退化", () => {
  assert.deepEqual(ngram("会诊记录"), ["会诊", "诊记", "记录"]);
  assert.deepEqual(ngram("林医生"), ["林医", "医生"]);
  assert.deepEqual(ngram(""), []);
  assert.deepEqual(ngram("a", 1), ["a"]);
});

test("cosine：相同向量=1，正交=0，部分重叠居中", () => {
  const df = buildDf(["会诊记录", "会诊意见", "病程记录"]);
  const v1 = tfidfVector("会诊记录", df, 3);
  const v2 = tfidfVector("会诊记录", df, 3);
  assert.ok(Math.abs(cosine(v1, v2) - 1) < 1e-9);
  const v3 = tfidfVector("病程记录", df, 3);
  assert.ok(cosine(v1, v3) >= 0);
  assert.ok(cosine(v1, v3) < cosine(v1, v2));
});

test("VectorIndex：语义近似命中（不出现关键词也能召回）", () => {
  const docs = [
    "风湿科：主张先压原发病，会诊时逐条念完部署",
    "内分泌科：把血糖当作一条不能断的链条",
    "血液科林医生：把四项评估条件一条条念完才肯上治疗",
  ];
  const idx = new VectorIndex(docs);
  // 剧情只说“先压原发病”，未出现“风湿科”关键词，仍应召回第 0 篇
  const hits = idx.query("先压原发病的那一科会逐条念完部署", 1);
  assert.ok(hits.length > 0);
  const h0 = hits[0];
  assert.ok(h0, "应召回第 0 篇");
  assert.equal(h0.index, 0);
  assert.ok(h0.score > 0);

  const hit2 = idx.query("那条不能断的链条快守不住了", 1);
  assert.ok(hit2.length > 0);
  const h1 = hit2[0];
  assert.ok(h1, "应召回第 1 篇");
  assert.equal(h1.index, 1);
});

test("VectorIndex：topK 数量与降序", () => {
  const idx = new VectorIndex(["甲乙丙", "甲", "丁戊"]);
  const hits = idx.query("甲乙", 2);
  assert.equal(hits.length, 2);
  const [a, b] = hits;
  assert.ok(a && b);
  assert.ok(a.score >= b.score);
  assert.equal(idx.size, 3);
});

test("VectorIndex：空语料安全", () => {
  const idx = new VectorIndex([]);
  assert.deepEqual(idx.query("任意"), []);
});