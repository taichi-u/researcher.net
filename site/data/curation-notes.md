# 関係データの出典と取り扱い

確認日: 2026-10-23。`curation.json` は手動確認した一次資料の記録で、再取得データとは独立して保持する。

## 収録内容

- 人物44人。指導関係25件（博士・修士、うち共同指導3件）。
- CSML / SLAB / DARTの3研究室、所属12件。
- 科研費20H05749とERC EXTREMAの2課題、参加16件。
- 共著、審査委員への就任、研究室の同時在籍だけから指導関係を作っていない。

## 指導関係の根拠

Purdueの6件は各学位リポジトリのFirst Advisor欄を根拠にした。Howell→Bosanac、Bosanac→Elliott・Sullivan・Bonasera・Smith、およびScheeres→Baresi・De Smet・Davis・Lujanは[大学公開のBosanac CV](https://www.colorado.edu/faculty/bosanac/sites/default/files/attached-files/bosanac_cv_0823_public.pdf)の明示的なadvisor欄を根拠にした。CVに列挙される審査委員を指導教員として扱っていない。

Howell/Scheeres→Olikaraは[本人の2013年発表資料](https://www.mat.uniroma2.it/~locatell/school1-astronet2/material/stud_presentations/zubin_olikara.pdf)、Scheeres→Tardivelは[CSML公式人物紹介](https://ccar.colorado.edu/scheeres/scheeres/people.html)で確認した。Polimiの関係は個別のPOLITesi記録にあるRelatore / Correlatore欄を保持した。Giuseppe Edoardo Addarioには主指導1人と共同指導3人を記録している。

## 年代・人物同定の注意

- `year`は明示された学位取得年。`startYear` / `endYear`は明示された指導・所属期間だけを保持する。年不明の`null`は「現在も継続中」を意味しない。
- Nicola Baresiの年は資料間で不一致。Bosanac CVは2017年春の卒業、CSMLは2018年3月のdefendedと記す。指導関係は収録するが年は`null`としている。
- Olikaraの博士指導関係は2013年資料に記載された在籍中の記録。博士号取得年はこの資料から確定していない。
- 学位取得年だけでは研究室への入室年は分からない。卒業年だけから「先輩→後輩」を生成しない。同時在籍判定にも完全な期間情報が必要。
- SLABの博士卒業生記録からD'Amicoの博士指導を推定していない。SLAB所属としてのみ収録した。KoenigやGuffantiの後年の博士研究員期間も博士在籍と混ぜていない。
- 過去の研究室ページにある勤務先を現在所属へ転記していない。現在所属の補完は、今回確認したJAXA公式教員紹介のOzakiのみ。
- 人物名は一次資料の表記を基準にした。OpenAlexとの対応は別途、所属・テーマ・共著者を照合する必要がある。同名候補が複数あれば自動統合しない。日本語別名を推測で追加しない。

## 研究費・課題参加

[科研費20H05749](https://kaken.nii.ac.jp/ja/grant/KAKENHI-PLANNED-20H05749/)は代表者1人・研究分担者2人を収録。実施期間は2020年10月〜2023年3月（研究年度2020〜2022）。課題の成果論文に載る全共著者を参加者にしていない。

[EXTREMA公式チーム](https://dart.polimi.it/extrema-erc/)は氏名と担当を列挙しているため、13人の役割をそのまま収録。[CORDIS](https://cordis.europa.eu/project/id/864697)で助成番号と実施期間2021〜2025年を確認した。公式チームページは参加者の在籍開始・終了を個別には示さない。プロジェクト全期間に全員が在籍したとの推定は禁止。

## データの範囲と検証

各evidenceはURL・資料名・確認日・確認状態・短い日本語要約を持つ。`quote`はnullで、`summary`は逐語引用ではない。名前を含め、各レコードの根拠を辿れる。人間関係や組織の全体像を網羅したデータではなく、今回一次資料で確認できた範囲である。日本・中国系の指導系譜は今後の調査余地が大きい。

JSON構文、全関係の人物参照、出典URL・確認日、重複関係、年の順序、Baresiの不確定年、共同指導件数を検証した。OpenAlexとの照合や画面検証は統合処理側で実施する。
